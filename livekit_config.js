/**
 * LiveKit 公開設定（不含密鑰，可放前端）
 *
 * - url：LiveKit Cloud 的 WebSocket 位址（公開資訊）
 * - tokenEndpoint：Cloudflare Pages Function 簽 token 的位址
 *
 * 注意：LIVEKIT_API_KEY / LIVEKIT_API_SECRET 絕對不能寫進任何前端檔案，
 * 只放在 Cloudflare Pages 的環境變數中。
 */
window.LIVEKIT_CONFIG = {
  url: 'wss://cmclinic-woa9939p.livekit.cloud',
  tokenEndpoint: '/api/token'
};
