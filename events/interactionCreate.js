const {
    Events,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { handleResponse } = require('../commands/cmReport');
const { handleResponseUser } = require('../commands/cuReport');
const { reportAssignButton, reportCloseButton } = require('../modules/report');
const {
    REPORT_GUILD_ID,
    REPORT_CHANNEL_ID,
    NSFW_CATEGORY_ID,
    SAFE_SOURCE_CHANNEL_ID,
    NSFW_SOURCE_CHANNEL_ID,
} = require('../init');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, client) {
        const db = client.mongo.commons;

        try {
            if (interaction.isButton()) {
                if (interaction.customId === 'assignReport') { reportAssignButton(interaction, client); return; }
                if (interaction.customId === 'closeReport') { reportCloseButton(interaction, client); return; }
                if (interaction.customId.startsWith('confirm-report-')) { await handleConfirmReport(interaction, db); return; }
                if (interaction.customId.startsWith('take-report-')) { await handleTakeReport(interaction, db); return; }
                if (interaction.customId.startsWith('ask-source-')) { await handleAskSource(interaction, client, db); return; }
            }

            if (interaction.isModalSubmit()) {
                if (interaction.customId === 'reportModal') { handleResponse(interaction); return; }
                if (interaction.customId === 'reportModalUser') { handleResponseUser(interaction); return; }
                if (interaction.customId.startsWith('report-')) { await handleReportModalSubmit(interaction, client, db); return; }
            }
        } catch (error) {
            console.error('[report] Interaction error:', error.message);
        }
    },
};

// ─── REPORTS ─────────────────────────────────────────────────────────────────

async function handleConfirmReport(interaction, db) {
    const messageId = interaction.customId.split('-')[2];
    const reports = db.collection('reports');

    const existing = await reports.findOne({ _id: messageId });

    if (!existing) {
        await reports.updateOne(
            { _id: messageId },
            {
                $setOnInsert: {
                    messageId,
                    messageContent: 'Données générées automatiquement',
                    status: 'open',
                },
                $set: { reports: {} },
            },
            { upsert: true },
        );
    } else if (existing.reports?.[interaction.user.id]) {
        await interaction.reply({
            content: '⚠️ Vous avez déjà signalé ce contenu. Votre signalement est pris en compte.',
            flags: 1 << 6,
        });
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(`report-${messageId}`)
        .setTitle('Signaler un contenu inapproprié');

    const reasonInput = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Motif du signalement')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('exemple: Humour-noir')
        .setRequired(true);

    const detailsInput = new TextInputBuilder()
        .setCustomId('details')
        .setLabel('Peux-tu en détailler plus ? (facultatif)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('exemple: "à 0:10 secondes, présence de gore" ou nous donner le contexte')
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(reasonInput),
        new ActionRowBuilder().addComponents(detailsInput),
    );

    await interaction.showModal(modal);

    const updatedRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`confirm-report-${messageId}`)
            .setLabel('Signaler ce contenu')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true),
    );

    try {
        await interaction.message.edit({ components: [updatedRow] });
    } catch (error) {
        console.error('[report] Button disable error:', error.message);
    }
}

async function handleReportModalSubmit(interaction, client, db) {
    await interaction.deferReply({ flags: 1 << 6 });

    const messageId = interaction.customId.split('-')[1];
    const reason = interaction.fields.getTextInputValue('reason');
    const details = interaction.fields.getTextInputValue('details') || 'Aucun détail fourni';

    const reports = db.collection('reports');
    const messageData = await reports.findOne({ _id: messageId });

    if (!messageData) {
        await interaction.editReply({ content: '❌ Le message signalé n\'existe plus ou est introuvable.' });
        return;
    }

    await reports.updateOne(
        { _id: messageId },
        {
            $set: {
                [`reports.${interaction.user.id}`]: {
                    reason,
                    details,
                    timestamp: Date.now(),
                    reportedBy: {
                        id: interaction.user.id,
                        username: interaction.user.username,
                    },
                },
            },
        },
    );

    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`take-report-${messageId}`)
            .setLabel('Prendre en compte')
            .setEmoji('👋')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setLabel('Lien du contenu')
            .setEmoji('🔗')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://discord.com/channels/${messageData.guildId}/${messageData.channelId}/${messageId}`),
    );

    const embed = new EmbedBuilder()
        .setTitle('Nouveau signalement d\'un contenu inapproprié')
        .setDescription(`[Lien vers le contenu signalé](https://discord.com/channels/${messageData.guildId}/${messageData.channelId}/${messageId})`)
        .addFields(
            { name: 'Motif', value: reason },
            { name: 'Détails du signalement', value: details },
            { name: 'Signalé par', value: `<@${interaction.user.id}> (${interaction.user.username})` },
            { name: 'Utilisateur signalé', value: messageData.author ? `<@${messageData.author.id}> (${messageData.author.username})` : 'Inconnu' },
        )
        .setTimestamp();

    const attachments = messageData.attachments || [];
    if (attachments.length > 0) {
        const first = attachments[0];
        const contentType = first.contentType || '';
        const isVideo = contentType.startsWith('video/') || first.url?.match(/\.(mp4|mov|webm)$/i);
        const isImage = contentType.startsWith('image/') || first.url?.match(/\.(png|jpe?g|gif|webp)$/i);

        if (isImage) {
            embed.setImage(first.url);
        } else if (isVideo) {
            const reportGuild = client.guilds.cache.get(REPORT_GUILD_ID);
            const reportChannel = reportGuild?.channels.cache.get(REPORT_CHANNEL_ID);
            const videoMsg = await reportChannel.send({ content: first.url });
            await videoMsg.reply({ embeds: [embed], components: [actionRow] });
            await interaction.editReply({ content: '✅ Merci pour votre signalement. Il sera examiné rapidement.' });
            return;
        }
    }

    const reportGuild = client.guilds.cache.get(REPORT_GUILD_ID);
    const reportChannel = reportGuild?.channels.cache.get(REPORT_CHANNEL_ID);
    await reportChannel.send({ embeds: [embed], components: [actionRow] });

    await interaction.editReply({ content: '✅ Merci pour votre signalement. Il sera examiné rapidement.' });
}

async function handleTakeReport(interaction, db) {
    const messageId = interaction.customId.split('-')[2];
    const reports = db.collection('reports');
    const messageData = await reports.findOne({ _id: messageId });

    if (!messageData) {
        await interaction.reply({ content: '❌ Le message signalé n\'existe plus ou est introuvable.', flags: 1 << 6 });
        return;
    }

    const updatedRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`take-report-${messageId}`)
            .setLabel(`Assigné(e) par ${interaction.user.username}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setLabel('Lien du contenu')
            .setEmoji('🔗')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://discord.com/channels/${messageData.guildId}/${messageData.channelId}/${messageId}`),
    );

    try {
        await interaction.message.edit({ components: [updatedRow] });
        await interaction.reply({ content: '✅ Vous avez pris en charge ce signalement.', flags: 1 << 6 });
    } catch (error) {
        console.error('[report] Take report error:', error.message);
        await interaction.reply({ content: '❌ Une erreur est survenue lors de la mise à jour du signalement.', flags: 1 << 6 });
    }
}

// ─── ASK SOURCE ──────────────────────────────────────────────────────────────

async function handleAskSource(interaction, client, db) {
    const messageId = interaction.customId.split('-')[2];
    const user = interaction.user;

    const reports = db.collection('reports');
    const messageData = await reports.findOne({ _id: messageId });

    if (!messageData) {
        await interaction.reply({ content: '❌ Le message signalé n\'existe plus ou est introuvable.', flags: 1 << 6 });
        return;
    }

    const guild = client.guilds.cache.get(messageData.guildId);
    if (!guild) {
        await interaction.reply({ content: '❌ Serveur introuvable.', flags: 1 << 6 });
        return;
    }

    const channel = guild.channels.cache.get(messageData.channelId);
    if (!channel) {
        await interaction.reply({ content: '❌ Salon introuvable.', flags: 1 << 6 });
        return;
    }

    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) {
        await interaction.reply({ content: '❌ Le message original est introuvable.', flags: 1 << 6 });
        return;
    }

    const sourceRequests = db.collection('sourceRequests');
    const existingRequest = await sourceRequests.findOne({ _id: messageId });
    const alreadyRequested = existingRequest?.requests?.[user.id];

    if (alreadyRequested) {
        await interaction.reply({ content: '⚠️ Vous avez déjà demandé la source de ce contenu.', flags: 1 << 6 });
        return;
    }

    const attachments = Array.from(message.attachments.values()).map(att => ({
        url: att.url,
        contentType: att.contentType || 'unknown',
    }));

    const isNSFW = channel.parentId === NSFW_CATEGORY_ID;
    const targetChannelId = isNSFW ? NSFW_SOURCE_CHANNEL_ID : SAFE_SOURCE_CHANNEL_ID;
    const sourceChannel = client.channels.cache.get(targetChannelId);

    if (!sourceChannel) {
        await interaction.reply({ content: '❌ Le salon de destination est introuvable.', flags: 1 << 6 });
        return;
    }

    const videoAttachment = attachments.find(att => att.contentType.startsWith('video/'));
    const imageAttachment = attachments.find(att => att.contentType.startsWith('image/'));

    const messageLink = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;
    const descriptionLine = `🔍 <@${user.id}> cherche la source d'un contenu posté par <@${message.author.id}> dans <#${message.channel.id}>\n[Voir le message original](${messageLink})`;

    if (videoAttachment) {
        await sourceChannel.send({ content: `${descriptionLine}\n${videoAttachment.url}` });
    } else {
        const embed = new EmbedBuilder()
            .setTitle('🔍 Demande de source')
            .setDescription(`<@${user.id}> cherche la source d'un contenu posté par <@${message.author.id}> dans <#${message.channel.id}>.`)
            .addFields({ name: 'Lien du message', value: `[Voir le message](${messageLink})` })
            .setTimestamp();

        if (imageAttachment) embed.setImage(imageAttachment.url);

        await sourceChannel.send({ embeds: [embed] });
    }

    await sourceRequests.updateOne(
        { _id: messageId },
        {
            $setOnInsert: {
                messageId,
                channelId: message.channel.id,
                guildId: message.guild.id,
                authorId: message.author.id,
            },
            $set: {
                [`requests.${user.id}`]: {
                    username: user.username,
                    timestamp: Date.now(),
                },
            },
        },
        { upsert: true },
    );

    await interaction.reply({ content: '✅ Votre demande de source a été envoyée dans le salon dédié.', flags: 1 << 6 });

    try {
        const updatedRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`ask-source-${message.id}`)
                .setLabel('Demande envoyée')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
        );
        await interaction.message.edit({ components: [updatedRow] });
    } catch {
        /* message déjà supprimé */
    }
}
