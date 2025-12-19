process.on('unhandledRejection', error => {
  console.error('UNHANDLED PROMISE REJECTION:', error);
});

process.on('uncaughtException', error => {
  console.error('UNCAUGHT EXCEPTION:', error);
});

require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const OpenAI = require('openai');

// ===== DISCORD CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ===== OPENAI CLIENT =====
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ===== SPLIT LONG MESSAGES =====
function splitMessage(text, maxLength = 2000) {
  const messages = [];
  while (text.length > maxLength) {
    let sliceIndex = text.lastIndexOf('\n', maxLength);
    if (sliceIndex === -1) sliceIndex = maxLength;
    messages.push(text.slice(0, sliceIndex));
    text = text.slice(sliceIndex);
  }
  if (text.length > 0) messages.push(text);
  return messages;
}

// ===== READY =====
client.once('ready', () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
});

// ===== SLASH COMMAND HANDLER =====
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    // ===== /DAILY =====
    if (interaction.commandName === 'daily') {
      const tips = [
        "Always build before you shoot for cover.",
        "Take high ground before engaging.",
        "Rotate early to avoid storm pressure.",
        "Carry at least two healing items.",
        "Edit builds to control fights."
      ];

      const tip = tips[Math.floor(Math.random() * tips.length)];
      return interaction.reply(`💡 **Daily Fortnite Tip:** ${tip}`);
    }

    // ===== /COACH =====
    if (interaction.commandName === 'coach') {
      const question = interaction.options.getString('question');
      const clip = interaction.options.getAttachment('clip');

      await interaction.deferReply();

      let prompt = question;
      if (clip) {
        prompt += `\nAnalyze this Fortnite clip: ${clip.url}`;
      }

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a Fortnite pro coach. Give concise, practical advice.' },
          { role: 'user', content: prompt }
        ]
      });

      const chunks = splitMessage(response.choices[0].message.content);
      for (const chunk of chunks) {
        await interaction.followUp(chunk);
      }
      return;
    }

    // ===== /REVIEW (PREMIUM) =====
    if (interaction.commandName === 'review') {
      const premiumRoleId = '885721299832438854';
      const clip = interaction.options.getAttachment('clip');

      if (!interaction.member.roles.cache.has(premiumRoleId)) {
        return interaction.reply({
          content: '🔒 This command is for **Premium users only**.\nUpgrade to unlock VOD reviews.',
          ephemeral: true
        });
      }

      if (!clip) {
        return interaction.reply({
          content: '❗ Please upload a Fortnite clip to review.',
          ephemeral: true
        });
      }

      await interaction.deferReply();

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a professional Fortnite VOD reviewer. Give clear, actionable improvement tips.'
          },
          {
            role: 'user',
            content: `Review this Fortnite clip:\n${clip.url}`
          }
        ]
      });

      const chunks = splitMessage(response.choices[0].message.content);
      for (const chunk of chunks) {
        await interaction.followUp(chunk);
      }
    }

  } catch (error) {
    console.error('COMMAND ERROR:', error);

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp('⚠️ Something went wrong.');
    } else {
      await interaction.reply('⚠️ Something went wrong.');
    }
  }
});

// ===== LOGIN =====
client.login(process.env.DISCORD_TOKEN);