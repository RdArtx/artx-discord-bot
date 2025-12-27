process.on('unhandledRejection', (error) => console.error('UNHANDLED:', error));
process.on('uncaughtException', (error) => console.error('UNCAUGHT:', error));

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
  GUILD_ID: !!process.env.GUILD_ID,
  PRO_ROLE_ID: !!process.env.PRO_ROLE_ID,
  ELITE_ROLE_ID: !!process.env.ELITE_ROLE_ID,
  STRIPE_PRO_PRICE_ID: !!process.env.STRIPE_PRO_PRICE_ID,
  STRIPE_ELITE_PRICE_ID: !!process.env.STRIPE_ELITE_PRICE_ID,
});

// ===== Discord client =====
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

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

// ===== Express server (Render requires PORT) =====
const app = express();

app.get('/', (req, res) => res.status(200).send('Artx bot is running ✅'));

// Stripe webhook needs RAW body
app.post('/webhook', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('❌ Stripe signature verification failed:', err.message);
    return res.status(400).send('Webhook Error');
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      const discordUserId = session?.metadata?.discord_user_id;
      const plan = session?.metadata?.plan; // "pro" or "elite"

      const guildId = process.env.GUILD_ID;
      const proRoleId = process.env.PRO_ROLE_ID;
      const eliteRoleId = process.env.ELITE_ROLE_ID;

      console.log('✅ checkout.session.completed:', {
        email: session.customer_details?.email,
        discordUserId,
        plan,
      });

      if (!discordUserId || !plan) {
        console.warn('⚠️ Missing discord_user_id or plan in metadata.');
      } else {
        const guild = await client.guilds.fetch(guildId);
        const member = await guild.members.fetch(discordUserId);

        const roleToAdd = plan === 'elite' ? eliteRoleId : proRoleId;
        await member.roles.add(roleToAdd);

        console.log(`🎉 Added ${plan.toUpperCase()} role to ${discordUserId}`);
      }
    }

    return res.json({ received: true });
  } catch (err) {
    console.error('❌ Webhook handler error:', err);
    return res.status(500).send('Server error');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Web server listening on port ${PORT}`));

// ===== Discord ready =====
client.once('ready', () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
});

// ===== Slash commands =====
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;

    // /daily
    if (interaction.commandName === 'daily') {
      const tips = [
        'Always build before you shoot for cover.',
        'Take high ground before engaging.',
        'Rotate early to avoid storm pressure.',
        'Carry at least two healing items.',
        'Edit builds to control fights.',
      ];
      const randomTip = tips[Math.floor(Math.random() * tips.length)];
      return interaction.reply(`💡 Daily Tip: ${randomTip}`);
    }

    // /coach
    if (interaction.commandName === 'coach') {
      await interaction.deferReply();

      const question = interaction.options.getString('question');
      const clip = interaction.options.getAttachment('clip');
      const clipText = clip ? `\nAnalyze this Fortnite clip: ${clip.url}` : '';

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a Fortnite pro coach. Give practical, concise advice.' },
          { role: 'user', content: question + clipText },
        ],
      });

      const aiText = response.choices[0].message.content || '';
      for (const chunk of splitMessage(aiText)) await interaction.followUp(chunk);
      return;
    }

    // /review (Elite-only)
    if (interaction.commandName === 'review') {
      const eliteRoleId = process.env.ELITE_ROLE_ID;

      if (!interaction.member?.roles?.cache?.has(eliteRoleId)) {
        return interaction.reply({
          content: '🔒 **Elite only.** Use `/upgrade_elite` to unlock VOD reviews.',
          ephemeral: true,
        });
      }

      await interaction.deferReply();

      const vod = interaction.options.getAttachment('vod');
      if (!vod) return interaction.followUp('❗ Please upload a VOD/clip.');

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a professional Fortnite VOD reviewer. Give clear, actionable improvement tips.' },
          { role: 'user', content: `Review this Fortnite clip and give improvement advice:\n${vod.url}` },
        ],
      });

      const aiText = response.choices[0].message.content || '';
      for (const chunk of splitMessage(aiText)) await interaction.followUp(chunk);
      return;
    }

    // /upgrade_pro
    if (interaction.commandName === 'upgrade_pro') {
      await interaction.deferReply({ ephemeral: true });

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: process.env.STRIPE_PRO_PRICE_ID, quantity: 1 }],
        success_url: 'https://discord.com/channels/@me',
        cancel_url: 'https://discord.com/channels/@me',
        metadata: { discord_user_id: interaction.user.id, plan: 'pro' },
      });

      return interaction.followUp(`💳 **Upgrade to Artx PRO**\n${session.url}`);
    }

    // /upgrade_elite
    if (interaction.commandName === 'upgrade_elite') {
      await interaction.deferReply({ ephemeral: true });

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: process.env.STRIPE_ELITE_PRICE_ID, quantity: 1 }],
        success_url: 'https://discord.com/channels/@me',
        cancel_url: 'https://discord.com/channels/@me',
        metadata: { discord_user_id: interaction.user.id, plan: 'elite' },
      });

      return interaction.followUp(`💳 **Upgrade to Artx ELITE**\n${session.url}`);
    }
  } catch (err) {
    console.error('INTERACTION ERROR:', err);

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp('⚠️ Something went wrong.');
      } else {
        await interaction.reply({ content: '⚠️ Something went wrong.', ephemeral: true });
      }
    } catch (e) {
      console.error('FAILED TO SEND ERROR MESSAGE:', e);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);