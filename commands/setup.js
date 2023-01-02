const { setupReport } = require("../utils/enmapUtils");

async function addSetupCommand(slashCommand) {
    slashCommand.addSubcommand((subcommand) =>
    subcommand
        .setName("report")
        .setDescription(
            "Définir/Supprimer le channel pour les threads privés des reports. (Il ne peut n'y en avoir qu'un)"
        )
        .addChannelOption((channel) =>
            channel
                .setName("input_channel")
                .setDescription("Entrez le channel où les reports se font.")
                .setRequired(true)
        )
        .addStringOption((string) =>
            string
                .setName("output_guild_id")
                .setDescription(
                    "Entrez l'ID du serveur où les reports seront envoyés pour le staff."
                )
                .setRequired(true)
        )
        .addStringOption((string) =>
            string
                .setName("output_channel_id")
                .setDescription(
                    "Entrez l'ID du channel où les reports seront envoyés pour le staff."
                )
                .setRequired(true)
        )
    );
}

/* ----------------------------------------------- */
/* FUNCTIONS                                       */
/* ----------------------------------------------- */
/**
 * Fonction appelé quand la commande est 'setup'
 * @param {CommandInteraction} interaction L'interaction généré par l'exécution de la commande.
 */
async function execute(interaction) {
    switch (interaction.options._subcommand) {
        case "report":
            // eslint-disable-next-line no-case-declarations
            const inputChannelReport =
                interaction.options.getChannel("input_channel");
            // eslint-disable-next-line no-case-declarations
            const outputGuildReport =
                interaction.options.getString("output_guild_id");
            // eslint-disable-next-line no-case-declarations
            const outputChannelReport =
                interaction.options.getString("output_channel_id");
            setupReport.set(interaction.guild.id, [
                inputChannelReport.id,
                outputGuildReport,
                outputChannelReport,
            ]);
            await interaction.reply({
                content: `Channel pour les threads des reports ajouté au serveur dans <#${inputChannelReport.id}> !\nOutput du serveur dans <#${outputChannelReport}>.`,
                ephemeral: true,
            });
            break;
    }
}

module.exports = {
    addSetupCommand,
    execute,
};
