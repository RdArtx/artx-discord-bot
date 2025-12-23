process.on('unhandledRejection', error => console.error('UNHANDLED:', error));
process.on('uncaughtException', error => console.error('UNCAUGHT:', error));

require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const OpenAI = require('openai');

const express = require('express');
const bodyParser = require('body-parser');
const Stripe = require('stripe');

// ===== ENV CHECK (safe logs) =====
console.log('ENV CHECK:', {
  DISCORD_TOKEN: !!process.env.DISCORD_TOKEN,
  OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
  STRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: !!process.env.STRIPE_WEBHOOK_SECRET,
  PREMIUM_ROLE_ID: !!process.env.PREMIUM_ROLE_ID,
  GUILD_ID: !!process.env.GUILD_ID,
});

// ===== Discord client =====
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// ===== OpenAI client =====
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ===== Stripe client =====
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ===== Helpers =====
function splitMessage(text, maxLength = 2000) {
  const chunks = [];
  while (text.length > maxLength) {
    let i = text.lastIndexOf('\n', maxLength);
    if (i === -1) i = maxLength;
    chunks.push(text.slice(0, i));
    text = text.slice(i);
  }
  if (text.length) chunks.push(text);
  return chunks;
}

// ===== Express webhook server (Render requires PORT) =====
const app = express();

// Health check so you can open the URL in a browser
app.get('/', (req, res) => res.status(200).send('Artx bot is running ✅'));

// Stripe requires RAW body for signature verification
app.post('/webhook', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('❌ Stripe signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      // We rely on metadata.discord_user_id set when creating the checkout session
      const discordUserId = session?.metadata?.discord_user_id;
      const guildId = process.env.GUILD_ID;
      const premiumRoleId = process.env.PREMIUM_ROLE_ID;

      console.log('✅ checkout.session.completed:', {
        email: session.customer_details?.email,
        discordUserId,
      });

      if (!discordUserId) {
        console.warn('⚠️ No discord_user_id in session.metadata. Cannot assign role.');
      } else if (!guildId || !premiumRoleId) {
        console.warn('⚠️ Missing GUILD_ID or PREMIUM_ROLE_ID env vars.');
      } else {
        const guild = await client.guilds.fetch(guildId);
        const member = await guild.members.fetch(discordUserId);

        await member.roles.add(premiumRoleId);
        console.log(`🎉 Premium role added to user ${discordUserId}`);
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('❌ Webhook handler error:', err);
    res.status(500).send('Server error');
  }
});

// Render provides PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Web server listening on port ${PORT}`);
});

// ===== Discord ready =====
client.once('ready', () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
});

// ===== Slash commands =====
client.on(Events.InteractionCreate, async interaction => {
  try {
    if (!interaction.isChatInputCommand()) return;

    // /daily
    if (interaction.commandName === 'daily') {
      const tips = [
        "Always build before you shoot for cover.",
        "Take high ground before engaging.",
        "Rotate early to avoid storm pressure.",
        "Carry at least two healing items.",
        "Edit builds to control fights."
      ];
      const randomTip = tips[Math.floor(Math.random() * tips.length)];
      return interaction.reply("💡 Daily Tip: " + randomTip);
    }

    // /coach
    if (interaction.commandName === 'coach') {
      const question = interaction.options.getString('question');
      const clip = interaction.options.getAttachment('clip');

      await interaction.deferReply();

      const clipText = clip ? `\nAnalyze this Fortnite clip: ${clip.url}` : '';

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a Fortnite pro coach. Give practical, concise advice.' },
          { role: 'user', content: question + clipText }
        ]
      });

      const aiText = response.choices[0].message.content;
      for (const chunk of splitMessage(aiText)) {
        await interaction.followUp(chunk);
      }
      return;
    }

    // /review (Premium-only)
    if (interaction.commandName === 'review') {
      const premiumRoleId = process.env.PREMIUM_ROLE_ID;

      if (!interaction.member.roles.cache.has(premiumRoleId)) {
        return interaction.reply({
          content: '🔒 This command is for **Premium users only**.\nUse `/upgrade` to unlock VOD reviews.',
          ephemeral: true
        });
      }

      const vod = interaction.options.getAttachment('clip'); // matches deploy-commands.js
      if (!vod) {
        return interaction.reply({ content: '❗ Please upload a clip.', ephemeral: true });
      }

      await interaction.deferReply();

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a professional Fortnite VOD reviewer. Give clear, actionable improvement tips.' },
          { role: 'user', content: `Review this Fortnite clip and give improvement advice:\n${vod.url}` }
        ]
      });

      const aiText = response.choices[0].message.content;
      for (const chunk of splitMessage(aiText)) {
        await interaction.followUp(chunk);
      }
      return;
    }

    // /upgrade (creates Stripe checkout session)
    if (interaction.commandName === 'upgrade') {
      await interaction.deferReply({ ephemeral: true });

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
        success_url: 'https://discord.com/channels/@me',
        cancel_url: 'https://discord.com/channels/@me',
        metadata: { discord_user_id: interaction.user.id }
      });

      return interaction.followUp(`💳 **Upgrade to Artx Premium**\n${session.url}`);
    }

  } catch (err) {
    console.error('INTERACTION ERROR:', err);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp('⚠️ Something went wrong.');
    } else {
      await interaction.reply('⚠️ Something went wrong.');
    }
  }
});

client.login(process.env.DISCORD_TOKEN);