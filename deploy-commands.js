require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Get a random Fortnite tip'),

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

  new SlashCommandBuilder()
    .setName('review')
    .setDescription('Get a full Fortnite VOD review (Elite only)')
    .addAttachmentOption(option =>
      option
        .setName('vod')
        .setDescription('Upload your Fortnite VOD/clip')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('upgrade_pro')
    .setDescription('Upgrade to Artx Pro ($7.99/mo)'),

  new SlashCommandBuilder()
    .setName('upgrade_elite')
    .setDescription('Upgrade to Artx Elite ($19.99/mo)'),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Started refreshing application (slash) commands...');
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('Successfully reloaded application (slash) commands.');
  } catch (error) {
    console.error(error);
  }
})();