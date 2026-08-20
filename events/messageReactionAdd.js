const {
    ButtonStyle,
    ButtonBuilder,
    ActionRowBuilder,
} = require('discord.js');
const {
    MODERATOR_ROLES,
    CUSTOM_EMOJI_NAME,
    CUSTOM_EMOJI_ID,
    DELETE_ON_MODERATOR_REACTION,
    MODERATION_LOG_CHANNEL_ID, FRANCEBOT_DISCORD_ID,
} = require('../init');

module.exports = {
    name: 'messageReactionAdd',
    async execute(reaction, user) {
        console.log(`Réaction ajoutée par ${user.username} sur le message ${reaction.message.id} avec l'emoji ${reaction.emoji.name}`);
        const client = user.client;
        const db = client.mongo.commons;

        if (reaction.partial) {
            try { await reaction.fetch(); } catch { return; }
            console.log(`Réaction récupérée pour le message ${reaction.message.id}`);
        }
        if (reaction.message.partial) {
            try { await reaction.message.fetch(); } catch { return; }
            console.log(`Message récupéré pour la réaction sur le message ${reaction.message.id}`);
        }
        if (user.partial) {
            try { await user.fetch(); } catch { return; }
            console.log(`Utilisateur récupéré : ${user.username}`);
        }

        if (reaction.emoji.name !== CUSTOM_EMOJI_NAME || reaction.emoji.id !== CUSTOM_EMOJI_ID) return;
        console.log(`La réaction correspond à l'emoji personnalisé ${CUSTOM_EMOJI_NAME} (${CUSTOM_EMOJI_ID})`);
        if (user.bot) return;
        console.log(`L'utilisateur ${user.username} n'est pas un bot, traitement de la réaction...`);

        const message = reaction.message;
        if (!message) return;

        // Check if this is FRANCE BOT
        if (user.id === FRANCEBOT_DISCORD_ID) return;
        console.log(`La réaction a été ajoutée par un utilisateur autre que FRANCE BOT, traitement de la réaction...`);
        // Check if there is FRANCE BOT in all reactions else do not consider this reaction
        const franceBotReaction = message.reactions.cache.find(r => r.users.cache.has(FRANCEBOT_DISCORD_ID));
        if (!franceBotReaction) return;
        console.log(`FRANCE BOT a originellement réagi à ce message, traitement de la réaction...`);

        const member = await message.guild.members.fetch(user.id);
        const isModerator = member.roles.cache.some(role => MODERATOR_ROLES.includes(role.id));

        try {
            await reaction.users.remove(user.id);
        } catch (error) {
            console.error(`Erreur lors de la suppression de la réaction de ${user.username}:`, error.message);
        }

        if (isModerator && DELETE_ON_MODERATOR_REACTION) {
            try {
                await message.delete();

                const logChannel = await message.guild.channels.fetch(MODERATION_LOG_CHANNEL_ID).catch(() => null);
                if (logChannel) {
                    const embed = {
                        title: 'Mème supprimé par un modérateur (via la réaction)',
                        color: 0xff0000,
                        fields: [
                            { name: 'Supprimé par :', value: `<@${user.id}>`, inline: true },
                            { name: 'Auteur du mème:', value: `<@${message.author.id}>`, inline: true },
                            { name: 'Dans le Salon :', value: `<#${message.channel.id}>`, inline: true },
                            { name: 'Date et heure :', value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
                        ],
                        timestamp: new Date().toISOString()
                    };
                    await logChannel.send({ embeds: [embed] });
                }
            } catch (err) {
                console.error('Erreur lors de la suppression du message :', err.message);
            }
            return;
        }

        try {
            const attachments = Array.from(message.attachments.values()).map(attachment => ({
                url: attachment.url,
                contentType: attachment.contentType || 'unknown',
            }));

            const existing = await db.collection('reports').findOne({ _id: message.id });
            if (!existing) {
                await db.collection('reports').updateOne(
                    { _id: message.id },
                    {
                        $set: {
                            messageId: message.id,
                            messageContent: message.content || 'Contenu non textuel',
                            author: {
                                id: message.author.id,
                                username: message.author.username,
                            },
                            channelId: message.channel.id,
                            guildId: message.guild.id,
                            timestamp: Date.now(),
                            attachments,
                            reports: {},
                            status: 'open',
                        },
                    },
                    { upsert: true }
                );
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`confirm-report-${message.id}`)
                    .setLabel('Signaler le contenu')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('⚠️'),
                new ButtonBuilder()
                    .setCustomId(`ask-source-${message.id}`)
                    .setLabel('Demander la source')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔍')
            );

            const messageContent = `Vous avez interagi avec un contenu envoyé par **${message.author.username}** dans le salon **#${message.channel.name}**.

Voici un lien vers le message : [Accéder au message](https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id})

Vous pouvez :
- **Signaler ce contenu** s'il vous semble inapproprié.
- **Demander la source** s'il s'agit d'un contenu dont vous voulez connaître l'origine.`;

            const dmMessage = await user.send({
                content: messageContent,
                components: [row],
            });

            setTimeout(async () => {
                try {
                    const fetchedMsg = await dmMessage.fetch();
                    const hasActiveButtons = fetchedMsg.components.some(row =>
                        row.components.some(btn => !btn.disabled)
                    );

                    if (hasActiveButtons) {
                        const expiredRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId('expired-button')
                                .setLabel('Signalement expiré')
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(true)
                        );

                        await fetchedMsg.edit({
                            content: 'Le délai pour signaler ou pour demander la source est expiré.',
                            components: [expiredRow],
                        });
                    }
                } catch (err) {
                    console.warn(`Impossible de modifier le message DM de ${user.username} après expiration :`, err.message);
                }
            }, 180000);

        } catch (error) {
            console.error('Erreur lors de la gestion de la réaction :', error.message);
        }
    },
};
