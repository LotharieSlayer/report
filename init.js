module.exports = {
    /** @type {string} ID du serveur de signalement */
    REPORT_GUILD_ID: '754274677253472336',
    /** @type {string} ID du salon de signalement */
    REPORT_CHANNEL_ID: '1038933930021236846',
    /** @type {string} ID de la catégorie NSFW (pour détecter les sources NSFW) */
    NSFW_CATEGORY_ID: '1108904810830368840',
    /** @type {string} ID du salon destiné aux sources safe (GIF/images) */
    SAFE_SOURCE_CHANNEL_ID: '774336077623853096',
    /** @type {string} ID du salon destiné aux sources NSFW */
    NSFW_SOURCE_CHANNEL_ID: '758695367545585784',
    /** @type {string[]} IDs des rôles modérateurs autorisés à supprimer via réaction */
    MODERATOR_ROLES: ['724416277296185364', '1063842621321134233', '724408327856980050'],
    /** @type {string} Nom de l'emoji custom utilisée pour signaler */
    CUSTOM_EMOJI_NAME: 'fmReport',
    /** @type {string} ID de l'emoji custom utilisée pour signaler */
    CUSTOM_EMOJI_ID: '1539612182889893988',
    /** @type {boolean} Supprimer le message si un modérateur réagit avec l'emoji de signalement */
    DELETE_ON_MODERATOR_REACTION: true,
    /** @type {string} ID du salon de logs de modération */
    MODERATION_LOG_CHANNEL_ID: '1385805521478615081',
    /** @type {string} ID du bot FranceBot */
    FRANCEBOT_DISCORD_ID: '756169303971070042',
};
