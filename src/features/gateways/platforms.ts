/**
 * Gateways feature — static catalogue of the 16 messaging platforms the
 * Hermes agent can bridge to. Each platform owns a list of environment
 * variables that the bridge process reads at startup (from a profile-scoped
 * `.env` file). For v0.2 we persist these values client-side via the
 * preload KV (`gateway.env.<platformId>.<envName>`); the bridge runtime is
 * not yet wired to read them — see `INTEGRATION.md`.
 *
 * Ported from the upstream `fathah` UI:
 *   /tmp/hermes-recon/fathah/src/renderer/src/constants.ts (lines 324-656)
 *
 * The keys here use lowercase ids (`telegram`, `imessage`, …) so they match
 * the names returned by the server's `/api/gateway/status` endpoint.
 */
import type { LucideIcon } from 'lucide-react';
import {
  Send,
  MessageCircle,
  Hash,
  Mail,
  Phone,
  Smartphone,
  Webhook,
  Home,
  MessageSquare,
} from 'lucide-react';

export interface EnvVarDef {
  /** Environment variable name as it would appear in the bridge `.env`. */
  name: string;
  /** Human-readable label shown next to the input. */
  label: string;
  /** Optional placeholder / hint text rendered inside the input. */
  placeholder?: string;
  /** When true the value is masked in the UI and never echoed back. */
  secret?: boolean;
  /** When true the field can stay empty without the platform being "broken". */
  optional?: boolean;
}

export interface PlatformDef {
  /** Lowercase id; matches `gateway_status.platforms[].name`. */
  id: string;
  /** Display name in the list + detail header. */
  label: string;
  /** One-sentence summary shown in the detail pane. */
  description: string;
  /**
   * Lucide icon component. We intentionally keep the bundle small by
   * reusing the same nine icons across platforms.
   */
  icon: LucideIcon;
  /** Documentation link rendered as "Open docs" in the detail pane. */
  docsUrl?: string;
  /** Ordered list of env vars the user can configure for this platform. */
  envVars: EnvVarDef[];
}

export const PLATFORMS: readonly PlatformDef[] = [
  {
    id: 'telegram',
    label: 'Telegram',
    description: 'Connect to Telegram via the Bot API.',
    icon: Send,
    docsUrl: 'https://core.telegram.org/bots',
    envVars: [
      {
        name: 'TELEGRAM_BOT_TOKEN',
        label: 'Bot Token',
        placeholder: '123456:ABC-DEF…',
        secret: true,
      },
      {
        name: 'TELEGRAM_ALLOWED_USERS',
        label: 'Allowed Users',
        placeholder: 'Comma-separated Telegram user IDs',
        optional: true,
      },
    ],
  },
  {
    id: 'discord',
    label: 'Discord',
    description: 'Connect to Discord via a bot token from the Developer Portal.',
    icon: MessageCircle,
    docsUrl: 'https://discord.com/developers/docs/intro',
    envVars: [
      {
        name: 'DISCORD_BOT_TOKEN',
        label: 'Bot Token',
        placeholder: 'Bot token from the Discord Developer Portal',
        secret: true,
      },
      {
        name: 'DISCORD_ALLOWED_CHANNELS',
        label: 'Allowed Channels',
        placeholder: 'Comma-separated channel IDs (optional)',
        optional: true,
      },
    ],
  },
  {
    id: 'slack',
    label: 'Slack',
    description: 'Connect to a Slack workspace using Socket Mode.',
    icon: Hash,
    docsUrl: 'https://api.slack.com/apis/socket-mode',
    envVars: [
      {
        name: 'SLACK_BOT_TOKEN',
        label: 'Bot Token',
        placeholder: 'xoxb-…',
        secret: true,
      },
      {
        name: 'SLACK_APP_TOKEN',
        label: 'App Token',
        placeholder: 'xapp-… (Socket Mode)',
        secret: true,
      },
    ],
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    description: 'Connect via WhatsApp Business API or a whatsapp-web.js bridge.',
    icon: MessageSquare,
    docsUrl: 'https://developers.facebook.com/docs/whatsapp',
    envVars: [
      {
        name: 'WHATSAPP_API_URL',
        label: 'API URL',
        placeholder: 'https://your-bridge.example.com',
      },
      {
        name: 'WHATSAPP_API_TOKEN',
        label: 'API Token',
        placeholder: 'Auth token for the WhatsApp API',
        secret: true,
      },
    ],
  },
  {
    id: 'signal',
    label: 'Signal',
    description: 'Connect via signal-cli running on the host.',
    icon: MessageSquare,
    docsUrl: 'https://github.com/AsamK/signal-cli',
    envVars: [
      {
        name: 'SIGNAL_PHONE_NUMBER',
        label: 'Phone Number',
        placeholder: '+15551234567',
      },
    ],
  },
  {
    id: 'matrix',
    label: 'Matrix',
    description: 'Connect to Matrix / Element rooms with an access token.',
    icon: Hash,
    docsUrl: 'https://matrix.org/docs/develop/',
    envVars: [
      {
        name: 'MATRIX_HOMESERVER',
        label: 'Homeserver',
        placeholder: 'https://matrix.org',
      },
      {
        name: 'MATRIX_USER_ID',
        label: 'User ID',
        placeholder: '@hermes:matrix.org',
      },
      {
        name: 'MATRIX_ACCESS_TOKEN',
        label: 'Access Token',
        placeholder: 'Long-lived access token',
        secret: true,
      },
    ],
  },
  {
    id: 'mattermost',
    label: 'Mattermost',
    description: 'Connect to a Mattermost server with a personal access token.',
    icon: Hash,
    docsUrl: 'https://developers.mattermost.com/integrate/reference/personal-access-token/',
    envVars: [
      {
        name: 'MATTERMOST_URL',
        label: 'Server URL',
        placeholder: 'https://mattermost.example.com',
      },
      {
        name: 'MATTERMOST_TOKEN',
        label: 'Personal Access Token',
        placeholder: 'Token generated from your account',
        secret: true,
      },
    ],
  },
  {
    id: 'email',
    label: 'Email',
    description: 'Send and receive mail via IMAP + SMTP.',
    icon: Mail,
    docsUrl: 'https://support.google.com/mail/answer/7126229',
    envVars: [
      {
        name: 'EMAIL_IMAP_SERVER',
        label: 'IMAP Server',
        placeholder: 'imap.gmail.com',
      },
      {
        name: 'EMAIL_SMTP_SERVER',
        label: 'SMTP Server',
        placeholder: 'smtp.gmail.com',
      },
      {
        name: 'EMAIL_ADDRESS',
        label: 'Email Address',
        placeholder: 'you@example.com',
      },
      {
        name: 'EMAIL_PASSWORD',
        label: 'Password',
        placeholder: 'App password (not your main password)',
        secret: true,
      },
    ],
  },
  {
    id: 'sms',
    label: 'SMS',
    description: 'Send and receive SMS via Twilio or Vonage.',
    icon: Phone,
    docsUrl: 'https://www.twilio.com/docs/sms',
    envVars: [
      {
        name: 'SMS_PROVIDER',
        label: 'Provider',
        placeholder: 'twilio or vonage',
      },
      {
        name: 'TWILIO_ACCOUNT_SID',
        label: 'Twilio Account SID',
        placeholder: 'AC…',
      },
      {
        name: 'TWILIO_AUTH_TOKEN',
        label: 'Twilio Auth Token',
        placeholder: 'Authentication token',
        secret: true,
      },
      {
        name: 'TWILIO_PHONE_NUMBER',
        label: 'Twilio Phone Number',
        placeholder: '+15551234567',
      },
    ],
  },
  {
    id: 'imessage',
    label: 'iMessage',
    description: 'Connect to iMessage via a BlueBubbles server on macOS.',
    icon: Smartphone,
    docsUrl: 'https://bluebubbles.app/install/',
    envVars: [
      {
        name: 'BLUEBUBBLES_URL',
        label: 'Server URL',
        placeholder: 'http://localhost:1234',
      },
      {
        name: 'BLUEBUBBLES_PASSWORD',
        label: 'Server Password',
        placeholder: 'Password set in BlueBubbles Server',
        secret: true,
      },
    ],
  },
  {
    id: 'dingtalk',
    label: 'DingTalk',
    description: 'Connect to a DingTalk workspace with an app key + secret.',
    icon: MessageSquare,
    docsUrl: 'https://open.dingtalk.com/document/',
    envVars: [
      {
        name: 'DINGTALK_APP_KEY',
        label: 'App Key',
        placeholder: 'From DingTalk developer console',
        secret: true,
      },
      {
        name: 'DINGTALK_APP_SECRET',
        label: 'App Secret',
        placeholder: 'DingTalk app secret',
        secret: true,
      },
    ],
  },
  {
    id: 'feishu',
    label: 'Feishu / Lark',
    description: 'Connect to a Feishu (Lark) workspace.',
    icon: MessageSquare,
    docsUrl: 'https://open.feishu.cn/document/',
    envVars: [
      {
        name: 'FEISHU_APP_ID',
        label: 'App ID',
        placeholder: 'From Feishu developer console',
      },
      {
        name: 'FEISHU_APP_SECRET',
        label: 'App Secret',
        placeholder: 'Feishu app secret',
        secret: true,
      },
    ],
  },
  {
    id: 'wecom',
    label: 'WeCom',
    description: 'Connect to WeCom enterprise messaging.',
    icon: MessageSquare,
    docsUrl: 'https://developer.work.weixin.qq.com/document/',
    envVars: [
      {
        name: 'WECOM_CORP_ID',
        label: 'Corp ID',
        placeholder: 'Corporation ID',
      },
      {
        name: 'WECOM_AGENT_ID',
        label: 'Agent ID',
        placeholder: 'Agent ID',
      },
      {
        name: 'WECOM_SECRET',
        label: 'Agent Secret',
        placeholder: 'Agent secret',
        secret: true,
      },
    ],
  },
  {
    id: 'wechat',
    label: 'WeChat',
    description: 'Connect to WeChat (Weixin) via the iLink Bot API.',
    icon: MessageSquare,
    docsUrl: 'https://github.com/ilinkbot',
    envVars: [
      {
        name: 'WEIXIN_BOT_TOKEN',
        label: 'Bot Token',
        placeholder: 'iLink Bot API token',
        secret: true,
      },
    ],
  },
  {
    id: 'webhooks',
    label: 'Webhooks',
    description: 'Receive messages from arbitrary services via signed HTTP webhooks.',
    icon: Webhook,
    docsUrl: 'https://en.wikipedia.org/wiki/Webhook',
    envVars: [
      {
        name: 'WEBHOOK_SECRET',
        label: 'Shared Secret',
        placeholder: 'Used to verify incoming webhook signatures',
        secret: true,
      },
    ],
  },
  {
    id: 'homeassistant',
    label: 'Home Assistant',
    description: 'Connect to a Home Assistant instance with a long-lived access token.',
    icon: Home,
    docsUrl: 'https://developers.home-assistant.io/docs/api/rest/',
    envVars: [
      {
        name: 'HA_URL',
        label: 'Server URL',
        placeholder: 'http://homeassistant.local:8123',
      },
      {
        name: 'HA_TOKEN',
        label: 'Access Token',
        placeholder: 'Long-lived access token',
        secret: true,
      },
    ],
  },
];

/** Lookup helper — returns the platform whose `id` matches, or undefined. */
export function findPlatform(id: string): PlatformDef | undefined {
  return PLATFORMS.find((p) => p.id === id);
}
