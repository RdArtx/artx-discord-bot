require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  // ===== /daily =====
  new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Get a random Fortnite tip'),

  // ===== /coach =====
  new SlashCommandBuilder()
    .setName('coach')
    .setDescription('Ask Artx a Fortnite question')
    .addStringOption(option =>
      option
        .setName('question')
        .setDescription('Your Fortnite question')
        .setRequired(true)
    )
    .addAttachmentOption(option =>
      option
        .setName('clip')
        .setDescription('Optional Fortnite clip for analysis')
        .setRequired(false)
    ),

  // ===== /review (Premium) =====
  new SlashCommandBuilder()
    .setName('review')
    .setDescription('Get a premium Fortnite VOD review')
    .addAttachmentOption(option =>
      option
        .setName('clip')
        .setDescription('Upload your Fortnite VOD')
        .setRequired(true)
    ),

  // ===== /upgrade =====
  new SlashCommandBuilder()
    .setName('upgrade')
    .setDescription('Upgrade to Artx Premium and unlock VOD reviews')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('🔄 Deploying slash commands...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('✅ Slash commands deployed successfully.');
  } catch (error) {
    console.error('❌ Error deploying commands:', error);
  }
})();
