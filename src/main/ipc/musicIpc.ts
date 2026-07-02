import { ipcMain, app, BrowserWindow, session, shell } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as crypto from 'crypto'
import {
  cloudsearch,
  song_detail,
  song_url,
  song_url_v1,
  login_qr_key,
  login_qr_create,
  login_qr_check,
  login_status,
  logout,
  user_account,
  user_playlist,
  comment_music,
  artist_detail,
  artist_songs,
  like as like_song,
  likelist,
  playlist_track_all,
  playlist_detail,
  playlist_track_add,
  playlist_create,
  personalized,
  recommend_resource,
  recommend_songs,
  dj_detail,
  dj_program,
  dj_hot,
  dj_sublist,
  user_audio,
  dj_paygift,
  record_recent_voice,
  lyric_new
} from 'NeteaseCloudMusicApi'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const QQ_MUSICU_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg'
const QQ_SMARTBOX_URL = 'https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg'
const QQ_HEADERS = {
  Referer: 'https://y.qq.com/',
  'User-Agent': UA
}

const NETEASE_LOGIN_PARTITION = 'persist:mineradio-netease-login'
const NETEASE_LOGIN_URL = 'https://music.163.com/#/login'
const QQ_LOGIN_PARTITION = 'persist:mineradio-qqmusic-login'
const QQ_LOGIN_URL = 'https://y.qq.com/n/ryqq/profile'

const QQ_LOGIN_COOKIE_PRIORITY = [
  'uin',
  'qqmusic_uin',
  'wxuin',
  'login_type',
  'qm_keyst',
  'qqmusic_key',
  'p_skey',
  'skey',
  'psrf_qqopenid',
  'psrf_qqunionid',
  'psrf_qqaccess_token',
  'psrf_qqrefresh_token',
  'wxopenid',
  'wxunionid',
  'wxrefresh_token',
  'wxskey',
  'p_uin',
  'ptcz',
  'RK'
]

const NETEASE_LOGIN_COOKIE_PRIORITY = [
  'MUSIC_U',
  '__csrf',
  'NMTID',
  'MUSIC_A',
  '__remember_me',
  '_ntes_nuid',
  '_ntes_nnid',
  'WEVNSM',
  'WNMCID',
  'JSESSIONID-WYYY'
]

// Cookie files in Electron userData directory
const COOKIE_FILE = path.join(app.getPath('userData'), '.cookie')
const QQ_COOKIE_FILE = path.join(app.getPath('userData'), '.qq-cookie')

let userCookie = ''
let qqCookie = ''

export function initCookies(): void {
  try {
    if (fs.existsSync(COOKIE_FILE)) {
      userCookie = fs.readFileSync(COOKIE_FILE, 'utf8').trim()
    }
  } catch (e) {
    userCookie = ''
  }
  try {
    if (fs.existsSync(QQ_COOKIE_FILE)) {
      qqCookie = fs.readFileSync(QQ_COOKIE_FILE, 'utf8').trim()
    }
  } catch (e) {
    qqCookie = ''
  }
}

function saveCookie(cookie: string): void {
  userCookie = (cookie || '').trim()
  try {
    fs.writeFileSync(COOKIE_FILE, userCookie, 'utf8')
  } catch (e) {
    console.error('[Cookie] Save failed:', e)
  }
}

function saveQQCookie(cookie: string): void {
  qqCookie = (cookie || '').trim()
  try {
    fs.writeFileSync(QQ_COOKIE_FILE, qqCookie, 'utf8')
  } catch (e) {
    console.error('[QQCookie] Save failed:', e)
  }
}

// Cookie Helper Functions
function parseCookieHeader(cookieText: string): Record<string, string> {
  const out: Record<string, string> = {}
  String(cookieText || '')
    .split(';')
    .forEach((part) => {
      const raw = String(part || '').trim()
      if (!raw) return
      const idx = raw.indexOf('=')
      if (idx <= 0) return
      out[raw.slice(0, idx).trim()] = raw.slice(idx + 1).trim()
    })
  return out
}

function qqCookieHasLogin(cookieText: string): boolean {
  const obj = parseCookieHeader(cookieText)
  const rawUin =
    Number(obj.login_type) === 2
      ? obj.wxuin || obj.uin || obj.p_uin || ''
      : obj.uin || obj.qqmusic_uin || obj.wxuin || obj.p_uin || ''
  const uin = String(rawUin).replace(/\D/g, '')
  const musicKey =
    obj.qm_keyst ||
    obj.qqmusic_key ||
    obj.music_key ||
    obj.p_skey ||
    obj.skey ||
    obj.psrf_qqaccess_token ||
    obj.psrf_qqrefresh_token ||
    obj.wxrefresh_token ||
    obj.wxskey ||
    ''
  return !!(uin && musicKey)
}

function qqCookieHasPlaybackLogin(cookieText: string): boolean {
  const obj = parseCookieHeader(cookieText)
  const rawUin =
    Number(obj.login_type) === 2
      ? obj.wxuin || obj.uin || obj.p_uin || ''
      : obj.uin || obj.qqmusic_uin || obj.wxuin || obj.p_uin || ''
  const uin = String(rawUin).replace(/\D/g, '')
  const playbackKey = obj.qm_keyst || obj.qqmusic_key || obj.music_key || obj.wxskey || ''
  return !!(uin && playbackKey)
}

function neteaseCookieHasLogin(cookieText: string): boolean {
  const obj = parseCookieHeader(cookieText)
  return !!obj.MUSIC_U
}

function isQQCookieDomain(domain: string): boolean {
  const normalized = String(domain || '')
    .replace(/^\./, '')
    .toLowerCase()
  return normalized === 'qq.com' || normalized.endsWith('.qq.com') || normalized.endsWith('qqmusic.qq.com')
}

function isNeteaseCookieDomain(domain: string): boolean {
  const normalized = String(domain || '')
    .replace(/^\./, '')
    .toLowerCase()
  return (
    normalized === '163.com' ||
    normalized.endsWith('.163.com') ||
    normalized === 'music.163.com' ||
    normalized.endsWith('.music.163.com') ||
    normalized === 'netease.com' ||
    normalized.endsWith('.netease.com')
  )
}

function buildCookieHeaderFor(cookies: any[], isAllowedDomain: (d: string) => boolean, priority: string[]): string {
  const picked = new Map<string, string>()
  ;(cookies || []).forEach((cookie) => {
    if (!cookie || !cookie.name || !isAllowedDomain(cookie.domain)) return
    picked.set(cookie.name, cookie.value || '')
  })

  const ordered: [string, string][] = []
  ;(priority || []).forEach((name) => {
    if (picked.has(name)) {
      ordered.push([name, picked.get(name)!])
      picked.delete(name)
    }
  })
  picked.forEach((value, name) => ordered.push([name, value]))

  return ordered
    .filter(([name, value]) => name && value != null && String(value) !== '')
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')
}

function buildCookieHeader(cookies: any[]): string {
  return buildCookieHeaderFor(cookies, isQQCookieDomain, QQ_LOGIN_COOKIE_PRIORITY)
}

async function readQQLoginCookieHeader(cookieSession: any): Promise<string> {
  const cookies = await cookieSession.cookies.get({})
  return buildCookieHeader(cookies)
}

async function readNeteaseLoginCookieHeader(cookieSession: any): Promise<string> {
  const cookies = await cookieSession.cookies.get({})
  return buildCookieHeaderFor(cookies, isNeteaseCookieDomain, NETEASE_LOGIN_COOKIE_PRIORITY)
}

// Window-based login dialog managers
function getSenderWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

async function openNeteaseMusicLoginWindow(owner: BrowserWindow | null): Promise<any> {
  const cookieSession = session.fromPartition(NETEASE_LOGIN_PARTITION)
  const initialCookie = await readNeteaseLoginCookieHeader(cookieSession)
  if (neteaseCookieHasLogin(initialCookie)) {
    saveCookie(initialCookie)
    return { ok: true, cookie: initialCookie, reused: true }
  }

  return new Promise((resolve) => {
    let settled = false
    let pollTimer: NodeJS.Timeout | null = null

    const loginWindow = new BrowserWindow({
      width: 940,
      height: 760,
      minWidth: 780,
      minHeight: 580,
      parent: owner && !owner.isDestroyed() ? owner : undefined,
      modal: false,
      show: false,
      autoHideMenuBar: true,
      title: '网易云音乐登录',
      backgroundColor: '#111111',
      webPreferences: {
        partition: NETEASE_LOGIN_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })

    const finish = async (result: any): Promise<void> => {
      if (settled) return
      settled = true
      if (pollTimer) clearInterval(pollTimer)
      if (loginWindow && !loginWindow.isDestroyed()) {
        loginWindow.close()
      }
      resolve(result)
    }

    const checkCookies = async (): Promise<void> => {
      try {
        const cookie = await readNeteaseLoginCookieHeader(cookieSession)
        if (neteaseCookieHasLogin(cookie)) {
          saveCookie(cookie)
          finish({ ok: true, cookie })
        }
      } catch (e: any) {
        console.warn('Netease login cookie check failed:', e.message)
      }
    }

    loginWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\/([^/]+\.)?(163|music\.163|netease)\.com/i.test(url)) {
        loginWindow.loadURL(url).catch((e) => console.warn('Netease login popup navigation failed:', e.message))
      } else if (/^https?:\/\//i.test(url)) {
        shell.openExternal(url).catch(() => {})
      }
      return { action: 'deny' }
    })

    loginWindow.webContents.on('did-finish-load', () => {
      checkCookies()
      loginWindow.webContents
        .executeJavaScript(
          `
        setTimeout(() => {
          const docs = [document];
          document.querySelectorAll('iframe').forEach((frame) => {
            try { if (frame.contentDocument) docs.push(frame.contentDocument); } catch (_) {}
          });
          for (const doc of docs) {
            const nodes = Array.from(doc.querySelectorAll('a, button, span, div'));
            const loginNode = nodes.find((node) => {
              const text = (node.textContent || '').trim();
              if (!/登录|立即登录/.test(text)) return false;
              const rect = node.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            });
            if (loginNode) { loginNode.click(); return true; }
          }
          return false;
        }, 900);
      `,
          true
        )
        .catch(() => {})
    })

    loginWindow.on('ready-to-show', () => loginWindow.show())
    loginWindow.on('closed', async () => {
      if (settled) return
      if (pollTimer) clearInterval(pollTimer)
      try {
        const cookie = await readNeteaseLoginCookieHeader(cookieSession)
        if (neteaseCookieHasLogin(cookie)) {
          saveCookie(cookie)
          resolve({ ok: true, cookie })
        } else {
          resolve({ ok: false, cancelled: true, message: '网易云登录窗口已关闭' })
        }
      } catch (e: any) {
        resolve({ ok: false, error: e.message || '网易云登录窗口已关闭' })
      }
    })

    pollTimer = setInterval(checkCookies, 1200)
    loginWindow.loadURL(NETEASE_LOGIN_URL).catch((e) => finish({ ok: false, error: e.message }))
  })
}

async function openQQMusicLoginWindow(owner: BrowserWindow | null): Promise<any> {
  const cookieSession = session.fromPartition(QQ_LOGIN_PARTITION)
  const initialCookie = await readQQLoginCookieHeader(cookieSession)
  if (qqCookieHasPlaybackLogin(initialCookie)) {
    saveQQCookie(initialCookie)
    return { ok: true, cookie: initialCookie, reused: true }
  }

  return new Promise((resolve) => {
    let settled = false
    let pollTimer: NodeJS.Timeout | null = null
    let warmupStarted = false

    const loginWindow = new BrowserWindow({
      width: 900,
      height: 720,
      minWidth: 760,
      minHeight: 560,
      parent: owner && !owner.isDestroyed() ? owner : undefined,
      modal: false,
      show: false,
      autoHideMenuBar: true,
      title: 'QQ 音乐登录',
      backgroundColor: '#111111',
      webPreferences: {
        partition: QQ_LOGIN_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })

    const finish = async (result: any): Promise<void> => {
      if (settled) return
      settled = true
      if (pollTimer) clearInterval(pollTimer)
      if (loginWindow && !loginWindow.isDestroyed()) {
        loginWindow.close()
      }
      resolve(result)
    }

    const checkCookies = async (): Promise<void> => {
      try {
        const cookie = await readQQLoginCookieHeader(cookieSession)
        if (qqCookieHasPlaybackLogin(cookie)) {
          saveQQCookie(cookie)
          finish({ ok: true, cookie })
        } else if (qqCookieHasLogin(cookie) && !warmupStarted) {
          warmupStarted = true
          setTimeout(() => {
            if (!settled && loginWindow && !loginWindow.isDestroyed()) {
              loginWindow
                .loadURL('https://y.qq.com/n/ryqq/player')
                .catch((e) => console.warn('QQ login warmup navigation failed:', e.message))
            }
          }, 900)
        }
      } catch (e: any) {
        console.warn('QQ login cookie check failed:', e.message)
      }
    }

    loginWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) {
        loginWindow.loadURL(url).catch((e) => console.warn('QQ login popup navigation failed:', e.message))
      } else {
        shell.openExternal(url).catch(() => {})
      }
      return { action: 'deny' }
    })

    loginWindow.webContents.on('did-finish-load', () => {
      checkCookies()
      loginWindow.webContents
        .executeJavaScript(
          `
        setTimeout(() => {
          const nodes = Array.from(document.querySelectorAll('a, button, span, div'));
          const loginNode = nodes.find((node) => {
            const text = (node.textContent || '').trim();
            if (!/登录|登陆/.test(text)) return false;
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          });
          if (loginNode) loginNode.click();
        }, 700);
      `,
          true
        )
        .catch(() => {})
    })

    loginWindow.on('ready-to-show', () => loginWindow.show())
    loginWindow.on('closed', async () => {
      if (settled) return
      if (pollTimer) clearInterval(pollTimer)
      try {
        const cookie = await readQQLoginCookieHeader(cookieSession)
        if (qqCookieHasLogin(cookie)) {
          saveQQCookie(cookie)
          resolve({ ok: true, cookie })
        } else {
          resolve({ ok: false, cancelled: true, message: 'QQ 登录窗口已关闭' })
        }
      } catch (e: any) {
        resolve({ ok: false, error: e.message || 'QQ 登录窗口已关闭' })
      }
    })

    pollTimer = setInterval(checkCookies, 1200)
    loginWindow.loadURL(QQ_LOGIN_URL).catch((e) => finish({ ok: false, error: e.message }))
  })
}

async function clearQQMusicLoginSession(): Promise<any> {
  const cookieSession = session.fromPartition(QQ_LOGIN_PARTITION)
  await cookieSession.clearStorageData({
    storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage']
  })
  saveQQCookie('')
  return { ok: true }
}

async function clearNeteaseMusicLoginSession(): Promise<any> {
  const cookieSession = session.fromPartition(NETEASE_LOGIN_PARTITION)
  await cookieSession.clearStorageData({
    storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage']
  })
  saveCookie('')
  return { ok: true }
}

// NetEase Mappings & Helpers
function parseCookieString(str: string): Record<string, string> {
  const out: Record<string, string> = {}
  ;(str || '').split(';').forEach((p) => {
    const idx = p.indexOf('=')
    if (idx > 0) {
      const key = p.substring(0, idx).trim()
      const val = p.substring(idx + 1).trim()
      if (key) out[key] = val
    }
  })
  return out
}

function firstPositiveNumberFrom(objects: any[], keys: string[]): number {
  for (const obj of objects) {
    if (!obj || typeof obj !== 'object') continue
    for (const key of keys) {
      const value = Number(obj[key])
      if (Number.isFinite(value) && value > 0) return value
    }
  }
  return 0
}

function collectStringValues(value: any, out: string[], depth: number): string[] {
  if (depth > 4 || value == null) return out
  if (typeof value === 'string') {
    if (value) out.push(value)
    return out
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStringValues(item, out, depth + 1))
    return out
  }
  if (typeof value === 'object') {
    Object.keys(value).forEach((key) => collectStringValues(value[key], out, depth + 1))
  }
  return out
}

function collectVipStringValues(value: any, out: string[], depth: number): string[] {
  if (depth > 4 || value == null) return out
  if (Array.isArray(value)) {
    value.forEach((item) => collectVipStringValues(item, out, depth + 1))
    return out
  }
  if (typeof value !== 'object') return out
  Object.keys(value).forEach((key) => {
    const child = value[key]
    if (/vip|svip|member|associator|privilege|right|level|package|label|title|type/i.test(key)) {
      collectStringValues(child, out, depth + 1)
    } else if (child && typeof child === 'object') {
      collectVipStringValues(child, out, depth + 1)
    }
  })
  return out
}

function normalizeNeteaseVip(profile: any, account: any, extra: any): any {
  profile = profile || {}
  account = account || {}
  extra = extra || {}
  const vipInfo =
    profile.vipInfo ||
    profile.vipinfo ||
    account.vipInfo ||
    account.vipinfo ||
    extra.vipInfo ||
    extra.vipinfo ||
    {}
  const objects = [account, profile, vipInfo, extra]
  const vipType = firstPositiveNumberFrom(objects, [
    'vipType',
    'vip_type',
    'viptype',
    'musicVipType',
    'music_vip_type',
    'musicVipLevel',
    'music_vip_level',
    'redVipLevel',
    'red_vip_level',
    'blackVipLevel',
    'black_vip_level',
    'luxuryVipLevel',
    'luxury_vip_level',
    'svipType',
    'svip_type'
  ])
  const text = collectVipStringValues({ account, profile, vipInfo, extra }, [], 0)
    .join(' ')
    .toLowerCase()
  const svipFlag =
    objects.some(
      (obj) =>
        obj &&
        (obj.isSvip === true ||
          obj.is_svip === true ||
          obj.svip === true ||
          Number(
            obj.isSvip || obj.is_svip || obj.svip || obj.svipType || obj.svip_type || 0
          ) > 0)
    ) || /svip|supervip|super_vip|blackvip|black_vip|黑胶svip|超级会员/.test(text)
  const vipFlag =
    objects.some(
      (obj) =>
        obj &&
        (obj.isVip === true ||
          obj.is_vip === true ||
          obj.vip === true ||
          Number(obj.isVip || obj.is_vip || obj.vip || obj.vipFlag || obj.vipflag || 0) > 0)
    ) || /vip|黑胶|会员/.test(text)
  const isSvip = svipFlag || vipType >= 10
  const isVip = isSvip || vipFlag || vipType > 0
  const vipLevel = isSvip ? 'svip' : isVip ? 'vip' : 'none'
  return {
    vipType,
    vipLevel,
    isVip,
    isSvip,
    vipLabel: vipLevel === 'svip' ? 'SVIP' : vipLevel === 'vip' ? 'VIP' : '无VIP'
  }
}

function normalizeLoginInfo(profile: any, account: any, extra: any): any {
  profile = profile || {}
  account = account || {}
  const userId =
    profile.userId ||
    profile.user_id ||
    profile.id ||
    account.userId ||
    account.id ||
    ''
  if (!(userId || userId === 0)) return { loggedIn: false }
  const vip = normalizeNeteaseVip(profile, account, extra)
  return {
    loggedIn: true,
    userId,
    nickname: profile.nickname || profile.userName || '网易云用户',
    avatar: profile.avatarUrl || profile.avatar || '',
    ...vip
  }
}

function isNeteaseAuthInvalidPayload(payload: any): boolean {
  const code = Number(payload && (payload.code || (payload.body && payload.body.code)))
  if (code === 301 || code === 401) return true
  const msg = String(
    payload &&
      (payload.message ||
        payload.msg ||
        (payload.body && (payload.body.message || payload.body.msg)) ||
        '')
  )
  return /未登录|需要登录|请先登录|login/i.test(msg) && code >= 300
}

async function getLoginInfo(): Promise<any> {
  if (!userCookie) {
    return {
      loggedIn: false,
      vipType: 0,
      vipLevel: 'none',
      isVip: false,
      isSvip: false,
      vipLabel: '无VIP'
    }
  }

  try {
    const st = await login_status({ cookie: userCookie, timestamp: Date.now() } as any)
    const body: any = st.body || {}
    const data = body.data || body
    const info = normalizeLoginInfo(data.profile || body.profile, data.account || body.account, data)
    if (info.loggedIn) return info
  } catch (e: any) {
    console.warn('[Login] login_status failed:', e.message)
  }

  try {
    const acc = await user_account({ cookie: userCookie, timestamp: Date.now() } as any)
    const body: any = acc.body || {}
    const info = normalizeLoginInfo(body.profile, body.account, body)
    if (info.loggedIn) return info
    if (isNeteaseAuthInvalidPayload(acc)) saveCookie('')
    return {
      loggedIn: false,
      hasCookie: !!userCookie,
      vipType: 0,
      vipLevel: 'none',
      isVip: false,
      isSvip: false,
      vipLabel: '无VIP'
    }
  } catch (e: any) {
    console.warn('[Login] account check failed:', e.message)
    return {
      loggedIn: false,
      hasCookie: !!userCookie,
      vipType: 0,
      vipLevel: 'none',
      isVip: false,
      isSvip: false,
      vipLabel: '无VIP'
    }
  }
}

function hasNeteaseSvip(loginInfo: any): boolean {
  return !!(
    loginInfo &&
    loginInfo.loggedIn &&
    (loginInfo.vipLevel === 'svip' || loginInfo.isSvip || Number(loginInfo.vipType || 0) >= 10)
  )
}

function mapArtists(raw: any[]): any[] {
  return (raw || [])
    .map((a) => ({ id: a && a.id, name: (a && a.name) || '' }))
    .filter((a) => a.name)
}

function mapSongRecord(s: any): any {
  s = s || {}
  const artists = mapArtists(s.ar || s.artists)
  const album = s.al || s.album || {}
  return {
    provider: 'netease',
    source: 'netease',
    type: 'song',
    id: s.id,
    name: s.name,
    artist: artists.map((a) => a.name).join(' / '),
    artists,
    artistId: artists[0] && artists[0].id,
    album: album.name || '',
    cover: album.picUrl || album.coverUrl || '',
    duration: s.dt || s.duration || 0,
    fee: s.fee
  }
}

function mapDiscoverPlaylist(pl: any, tag: string): any {
  pl = pl || {}
  const creator = pl.creator || pl.user || {}
  const id = pl.id || pl.resourceId || pl.creativeId
  return {
    provider: 'netease',
    source: 'netease',
    type: 'playlist',
    id,
    name: pl.name || pl.title || '',
    cover:
      pl.picUrl ||
      pl.coverImgUrl ||
      pl.coverUrl ||
      (pl.uiElement && pl.uiElement.image && pl.uiElement.image.imageUrl) ||
      '',
    trackCount: pl.trackCount || pl.songCount || pl.programCount || 0,
    playCount: pl.playCount || pl.playcount || 0,
    creator: creator.nickname || creator.name || '',
    tag: tag || pl.alg || ''
  }
}

function playbackRestriction(
  provider: string,
  category: string,
  message: string,
  action: string,
  extra?: any
): any {
  return {
    provider,
    category,
    action: action || '',
    message,
    ...(extra || {})
  }
}

function classifyNeteasePlaybackRestriction(lastData: any, loginInfo: any): any {
  const loggedIn = !!(loginInfo && loginInfo.loggedIn)
  const fee = Number(lastData && lastData.fee)
  const code = Number(lastData && lastData.code)
  const freeTrial = lastData && lastData.freeTrialInfo
  if (!loggedIn) {
    return playbackRestriction(
      'netease',
      'login_required',
      '网易云需要登录后尝试获取完整播放地址',
      'login',
      { code, fee }
    )
  }
  if (freeTrial) {
    return playbackRestriction(
      'netease',
      'trial_only',
      '网易云仅返回试听片段，完整播放需要会员或购买',
      'upgrade',
      { code, fee }
    )
  }
  if (fee === 1) {
    return playbackRestriction(
      'netease',
      'vip_required',
      '网易云歌曲需要 VIP 权限，当前无法获取完整播放地址',
      'upgrade',
      { code, fee }
    )
  }
  if (fee === 4 || fee === 8) {
    return playbackRestriction(
      'netease',
      'paid_required',
      '网易云歌曲需要单曲、专辑购买或更高权限',
      'purchase',
      { code, fee }
    )
  }
  if (code === 404 || code === 403) {
    return playbackRestriction(
      'netease',
      'copyright_unavailable',
      '网易云版权暂不可播，换源或稍后重试会更稳',
      'switch_source',
      { code, fee }
    )
  }
  return playbackRestriction(
    'netease',
    'url_unavailable',
    '网易云没有返回可播放地址，可能是版权、会员或地区限制',
    loggedIn ? 'switch_source' : 'login',
    { code, fee }
  )
}

const NETEASE_QUALITY_CANDIDATES = [
  { level: 'jymaster', br: 1999000, label: '超清母带', svip: true },
  { level: 'hires', br: 1999000, label: '高清臻音' },
  { level: 'lossless', br: 1411000, label: '无损' },
  { level: 'exhigh', br: 999000, label: '极高' },
  { level: 'standard', br: 128000, label: '标准' }
]

function normalizeQualityPreference(value: any): string {
  const raw = String(value || '')
    .toLowerCase()
    .trim()
  if (['jymaster', 'master', 'studio', 'svip'].includes(raw)) return 'jymaster'
  if (['hires', 'hi-res', 'highres', 'zhenyin', 'spatial'].includes(raw)) return 'hires'
  if (['lossless', 'flac', 'sq'].includes(raw)) return 'lossless'
  if (['exhigh', 'high', '320', '320k', 'hq'].includes(raw)) return 'exhigh'
  if (['standard', 'normal', '128', '128k', 'std'].includes(raw)) return 'standard'
  return 'hires'
}

function qualityCandidatesFrom(target: string, candidates: any[]): any[] {
  target = normalizeQualityPreference(target)
  let start = candidates.findIndex((item) => item.level === target)
  if (start < 0) start = 0
  return candidates.slice(start)
}

const COOKIE_ATTRIBUTE_NAMES = new Set(['path', 'domain', 'expires', 'max-age', 'samesite', 'secure', 'httponly'])

function collectCookiePair(picked: Map<string, string>, key: string, value: any): void {
  key = String(key || '').trim()
  if (!key || COOKIE_ATTRIBUTE_NAMES.has(key.toLowerCase())) return
  if (value === null || value === undefined) return
  picked.set(key, String(value).trim())
}

function collectCookieInput(input: any, picked: Map<string, string>): void {
  if (input === null || input === undefined) return
  if (Array.isArray(input)) {
    input.forEach((item) => collectCookieInput(item, picked))
    return
  }
  if (typeof input === 'object') {
    if (input.name && Object.prototype.hasOwnProperty.call(input, 'value')) {
      collectCookiePair(picked, input.name, input.value)
      return
    }
    Object.keys(input).forEach((key) => {
      const value = input[key]
      if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'value')) {
        collectCookiePair(picked, key, value.value)
      } else if (typeof value !== 'object') {
        collectCookiePair(picked, key, value)
      }
    })
    return
  }
  String(input).split(/\r?\n/).forEach((line) => {
    line.split(';').forEach((part) => {
      const raw = String(part || '').trim()
      const idx = raw.indexOf('=')
      if (idx <= 0) return
      collectCookiePair(picked, raw.slice(0, idx), raw.slice(idx + 1))
    })
  })
}

function normalizeCookieHeader(input: any): string {
  const picked = new Map<string, string>()
  collectCookieInput(input, picked)
  return Array.from(picked.entries())
    .filter(([key, value]) => key && value != null && String(value) !== '')
    .map(([key, value]) => `${key}=${value}`)
    .join('; ')
}

function readCookieFromResponse(resp: any): string {
  const candidates = [
    resp && resp.cookie,
    resp && resp.body && resp.body.cookie,
    resp && resp.body && resp.body.data && resp.body.data.cookie,
    resp && resp.body && resp.body.data && resp.body.data.cookies
  ]
  for (const candidate of candidates) {
    const cookie = normalizeCookieHeader(candidate)
    if (cookie) return cookie
  }
  return ''
}

async function handleSongUrl(id: string, loginInfo: any, qualityPreference: string): Promise<any> {
  console.log('[SongUrl] id:', id, 'logged-in:', !!userCookie)
  const requestedQuality = normalizeQualityPreference(qualityPreference)
  const svipReady = hasNeteaseSvip(loginInfo)
  const qualities = qualityCandidatesFrom(requestedQuality, NETEASE_QUALITY_CANDIDATES)
    .filter((q) => !q.svip || svipReady)

  let trialFallback: any = null
  let lastData: any = null
  let lastError: any = null

  for (const q of qualities) {
    try {
      let result: any
      try {
        result = await song_url_v1({ id, level: q.level, cookie: userCookie } as any)
      } catch (e) {
        result = await song_url({ id, br: q.br, cookie: userCookie } as any)
      }
      const d = result.body && result.body.data && result.body.data[0]
      if (d) lastData = d
      const url = d && d.url
      const freeTrial = d && d.freeTrialInfo
      console.log('[SongUrl]', q.level, '->', url ? 'OK' : 'no url', freeTrial ? '(TRIAL)' : '')
      if (url && !freeTrial) {
        return { url, trial: false, playable: true, level: q.level, quality: q.label, br: d.br, requestedQuality }
      }
      if (url && freeTrial && !trialFallback) {
        trialFallback = {
          url,
          trial: true,
          playable: true,
          level: q.level,
          quality: q.label,
          br: d.br,
          requestedQuality,
          trialInfo: freeTrial,
          restriction: classifyNeteasePlaybackRestriction(d, loginInfo)
        }
      }
    } catch (err) {
      lastError = err
      console.log('[SongUrl]', q.level, 'failed:', (err as any).message)
    }
  }
  if (trialFallback) return trialFallback
  const restriction = classifyNeteasePlaybackRestriction(lastData, loginInfo)
  return {
    url: null,
    trial: false,
    playable: false,
    reason: restriction.category,
    message: restriction.message,
    restriction,
    lastCode: lastData && lastData.code,
    fee: lastData && lastData.fee,
    error: lastError && lastError.message,
    requestedQuality
  }
}

// QQ Mappings & Helpers
function qqCookieObject(): Record<string, string> {
  return parseCookieString(qqCookie)
}

function normalizeQQUin(raw: any): string {
  const digits = String(raw || '').replace(/\D/g, '')
  return digits.replace(/^0+/, '') || digits
}

function qqCookieUin(obj?: Record<string, string>): string {
  obj = obj || qqCookieObject()
  const raw =
    Number(obj.login_type) === 2
      ? obj.wxuin || obj.uin || obj.p_uin
      : obj.uin || obj.qqmusic_uin || obj.wxuin || obj.p_uin
  return normalizeQQUin(raw)
}

function qqCookieMusicKey(obj?: Record<string, string>): string {
  obj = obj || qqCookieObject()
  return (
    obj.qm_keyst ||
    obj.qqmusic_key ||
    obj.music_key ||
    obj.p_skey ||
    obj.skey ||
    obj.psrf_qqopenid ||
    obj.psrf_qqunionid ||
    obj.psrf_qqaccess_token ||
    obj.psrf_qqrefresh_token ||
    obj.wxrefresh_token ||
    obj.wxskey ||
    ''
  )
}

function qqCookiePlaybackKey(obj?: Record<string, string>): string {
  obj = obj || qqCookieObject()
  return obj.qm_keyst || obj.qqmusic_key || obj.music_key || obj.wxskey || ''
}

function decodeQQCookieValue(value: any): string {
  try {
    return decodeURIComponent(String(value || '').replace(/\+/g, '%20')).trim()
  } catch (e) {
    return String(value || '').trim()
  }
}

function qqCookieNickname(obj?: Record<string, string>, uin?: string): string {
  obj = obj || qqCookieObject()
  uin = normalizeQQUin(uin || qqCookieUin(obj))
  const keys = [uin && 'ptnick_' + uin, 'nickname', 'nick', 'qqmusic_nick', 'pgv_info']
  for (const k of keys) {
    if (k && obj[k]) {
      const val = decodeQQCookieValue(obj[k])
      if (val) return val
    }
  }
  return ''
}

function qqCookieAvatar(obj?: Record<string, string>, uin?: string): string {
  obj = obj || qqCookieObject()
  const direct = obj.qqmusic_avatar || obj.avatar || obj.avatarUrl || obj.headpic || ''
  if (direct) return decodeQQCookieValue(direct)
  uin = normalizeQQUin(uin || qqCookieUin(obj))
  return uin ? `https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(uin)}&s=100` : ''
}

function parseJSONText(text: string): any {
  const raw = String(text || '').trim()
  const json = raw.replace(/^callback\(([\s\S]*)\);?$/, '$1')
  return JSON.parse(json)
}

async function qqMusicRequest(payload: any, opts?: any): Promise<any> {
  opts = opts || {}
  const body = JSON.stringify(payload)
  const headers: Record<string, string> = {
    ...QQ_HEADERS,
    'Content-Type': 'application/json;charset=UTF-8'
  }
  if (opts.cookie && qqCookie) headers.Cookie = qqCookie

  const res = await fetch(QQ_MUSICU_URL, {
    method: 'POST',
    headers,
    body
  })
  const text = await res.text()
  return parseJSONText(text)
}

function normalizeQQProfile(body: any, cookieObj?: Record<string, string>): any {
  cookieObj = cookieObj || qqCookieObject()
  const uin = qqCookieUin(cookieObj)
  const data = (body && (body.data || body.profile || body.creator || body.result)) || {}
  const creator = data.creator || data.user || data.profile || data || {}
  const vipInfo = data.vipInfo || data.vipinfo || data.vip || creator.vipInfo || creator.vipinfo || {}
  const profileNick =
    creator.nick || creator.nickname || creator.name || creator.hostname || creator.title || ''
  const profileAvatar = creator.headpic || creator.avatar || creator.avatarUrl || creator.logo || ''
  const cookieNick = qqCookieNickname(cookieObj, uin)
  const nick = profileNick || cookieNick || ''
  const avatar = profileAvatar || qqCookieAvatar(cookieObj, uin)
  let vipType =
    Number(
      cookieObj.vipType ||
        cookieObj.vip_type ||
        data.vipType ||
        data.vip_type ||
        data.viptype ||
        data.music_vip_level ||
        data.green_vip_level ||
        data.luxury_vip_level ||
        creator.vipType ||
        creator.vip_type ||
        creator.music_vip_level ||
        creator.green_vip_level ||
        creator.luxury_vip_level ||
        vipInfo.vipType ||
        vipInfo.vip_type ||
        vipInfo.music_vip_level ||
        vipInfo.green_vip_level ||
        vipInfo.luxury_vip_level ||
        0
    ) || 0
  if (!vipType) {
    const vipFlag =
      data.isVip ||
      data.is_vip ||
      data.vipFlag ||
      data.vipflag ||
      creator.isVip ||
      creator.is_vip ||
      vipInfo.isVip ||
      vipInfo.is_vip ||
      vipInfo.vipFlag
    if (vipFlag === true || Number(vipFlag) > 0 || String(vipFlag || '').toLowerCase() === 'true') {
      vipType = 1
    }
  }
  return {
    provider: 'qq',
    loggedIn: !!(uin && qqCookieMusicKey(cookieObj)),
    preview: false,
    userId: uin,
    nickname: nick || (uin ? 'QQ ' + uin : 'QQ 音乐'),
    avatar,
    vipType,
    hasCookie: !!qqCookie,
    playbackKeyReady: !!qqCookiePlaybackKey(cookieObj),
    profileSource: profileNick || profileAvatar ? 'qq-profile' : cookieNick || avatar ? 'cookie' : 'fallback'
  }
}

async function getQQLoginInfo(): Promise<any> {
  const cookieObj = qqCookieObject()
  const uin = qqCookieUin(cookieObj)
  const musicKey = qqCookieMusicKey(cookieObj)
  if (!uin || !musicKey) return { provider: 'qq', loggedIn: false, hasCookie: !!qqCookie }
  const fallback = normalizeQQProfile(null, cookieObj)
  try {
    const u = new URL('https://c.y.qq.com/rsc/fcgi-bin/fcg_get_profile_homepage.fcg')
    u.searchParams.set('cid', '205360838')
    u.searchParams.set('userid', uin)
    u.searchParams.set('reqfrom', '1')
    u.searchParams.set('g_tk', '5381')
    u.searchParams.set('loginUin', uin)
    u.searchParams.set('hostUin', '0')
    u.searchParams.set('format', 'json')
    u.searchParams.set('inCharset', 'utf8')
    u.searchParams.set('outCharset', 'utf-8')
    u.searchParams.set('notice', '0')
    u.searchParams.set('platform', 'yqq.json')
    u.searchParams.set('needNewCode', '0')
    const res = await fetch(u.toString(), {
      headers: { ...QQ_HEADERS, Cookie: qqCookie }
    })
    const text = await res.text()
    const body = parseJSONText(text)
    const info = normalizeQQProfile(body, cookieObj)
    if (body && (body.code === 1000 || body.result === 301)) {
      return { ...fallback, profileUnavailable: true }
    }
    return info
  } catch (e: any) {
    console.warn('[QQLogin] profile check failed:', e.message)
    return { ...fallback, profileUnavailable: true }
  }
}

async function qqGetJSON(targetUrl: string, params: any, opts?: any): Promise<any> {
  opts = opts || {}
  const u = new URL(targetUrl)
  Object.keys(params || {}).forEach((k) => {
    if (params[k] != null) u.searchParams.set(k, String(params[k]))
  })
  const headers: Record<string, string> = { ...QQ_HEADERS, ...(opts.headers || {}) }
  if (opts.cookie !== false && qqCookie) headers.Cookie = qqCookie
  const res = await fetch(u.toString(), { headers })
  const text = await res.text()
  return parseJSONText(text)
}

function qqAlbumCover(albumMid: string, size?: number): string {
  if (!albumMid) return ''
  const px = size || 300
  return 'https://y.qq.com/music/photo_new/T002R' + px + 'x' + px + 'M000' + albumMid + '.jpg?max_age=2592000'
}

function qqSingerAvatar(singerMid: string, size?: number): string {
  if (!singerMid) return ''
  const px = size || 300
  return 'https://y.qq.com/music/photo_new/T001R' + px + 'x' + px + 'M000' + singerMid + '.jpg?max_age=2592000'
}

function mapQQArtists(raw: any[]): any[] {
  return (raw || [])
    .map((a) => ({
      id: a && a.id,
      mid: a && a.mid,
      name: (a && (a.name || a.title)) || ''
    }))
    .filter((a) => a.name)
}

function mapQQPlaylist(pl: any, kind: string): any {
  pl = pl || {}
  const id = pl.dissid || pl.tid || pl.dirid || pl.id || pl.diss_id
  return {
    provider: 'qq',
    source: 'qq',
    id: id ? String(id) : '',
    name: pl.diss_name || pl.name || pl.title || '',
    cover: pl.diss_cover || pl.logo || pl.picurl || pl.cover || '',
    trackCount: pl.song_cnt || pl.songnum || pl.total_song_num || pl.song_count || 0,
    playCount: pl.listen_num || pl.visitnum || pl.play_count || 0,
    creator: pl.hostname || pl.nick || pl.creator || 'QQ 音乐',
    subscribed: kind === 'collect',
    specialType: 0
  }
}

function mapQQPlaylistTrack(raw: any): any {
  raw = raw || {}
  const track =
    raw.songid || raw.songmid || raw.mid || raw.name
      ? raw
      : raw.track_info || raw.songInfo || raw.songinfo || raw.song || {}
  const album = track.album || {}
  const artists = mapQQArtists(track.singer || track.singers || [])
  const mid = track.mid || track.songmid || raw.mid || raw.songmid || ''
  const albumMid = album.mid || track.albummid || raw.albummid || ''
  return {
    provider: 'qq',
    source: 'qq',
    type: 'qq',
    id: mid || String(track.id || track.songid || raw.id || raw.songid || ''),
    qqId: track.id || track.songid || raw.id || raw.songid || '',
    mid,
    songmid: mid,
    mediaMid: (track.file && track.file.media_mid) || track.strMediaMid || track.media_mid || raw.strMediaMid || '',
    name: track.name || track.songname || raw.songname || '',
    artist: artists.map((a) => a.name).join(' / ') || track.singername || raw.singername || '',
    artists,
    artistId: artists[0] && (artists[0].id || artists[0].mid),
    artistMid: artists[0] && artists[0].mid,
    album: album.name || album.title || track.albumname || raw.albumname || '',
    albumMid,
    cover: qqAlbumCover(albumMid, 300),
    duration: (Number(track.interval || raw.interval) || 0) * 1000,
    fee: track.pay && Number(track.pay.pay_play) ? 1 : 0,
    playable: false
  }
}

function isQQFavoritePlaylist(pl: any): boolean {
  const name = String((pl && pl.name) || '').trim()
  return /我喜欢|我的喜欢|喜欢的音乐/i.test(name)
}

function isQzoneBackgroundPlaylist(pl: any): boolean {
  const text = String(((pl && pl.name) || '') + ' ' + ((pl && pl.creator) || '')).toLowerCase()
  return /qzone|空间|背景音乐/i.test(text)
}

function isLowSignalPodcastItem(item: any): boolean {
  const name = String(item && (item.name || item.title || item.radioName)).toLowerCase()
  const sub = String(item && (item.djName || item.category || item.desc || item.sub)).toLowerCase()
  const text = name + ' ' + sub
  return /购买播客|付费精品|qzone|空间背景音乐|背景音乐/i.test(text)
}

function mapPodcastRadio(r: any): any {
  r = r || {}
  const dj = r.dj || r.djSimple || r.djUser || r.creator || {}
  const id = r.id || r.rid || r.radioId
  return {
    id,
    rid: id,
    name: r.name || r.radioName || '',
    cover: r.picUrl || r.picURL || r.coverUrl || r.coverImgUrl || r.avatarUrl || '',
    desc: r.desc || r.description || r.rcmdText || '',
    djName: dj.nickname || r.djName || r.nickname || '',
    category: r.category || r.categoryName || '',
    programCount: r.programCount || r.programNum || r.programCnt || 0,
    subCount: r.subCount || r.subedCount || r.subscriberCount || 0
  }
}

function mapPodcastProgram(p: any, fallbackRadio?: any): any {
  p = p || {}
  const mainSong = p.mainSong || p.song || p.mainTrack || {}
  const radio = p.radio || fallbackRadio || {}
  const mappedRadio = mapPodcastRadio(radio)
  const artists = mapArtists(mainSong.ar || mainSong.artists || [])
  const album = mainSong.al || mainSong.album || {}
  const dj = p.dj || radio.dj || {}
  const playableId = mainSong.id || p.mainSongId || p.songId
  return {
    type: 'podcast',
    source: 'podcast',
    id: playableId,
    programId: p.id || p.programId,
    radioId: mappedRadio.id,
    name: p.name || mainSong.name || '',
    artist:
      mappedRadio.name || dj.nickname || artists.map((a) => a.name).join(' / ') || mappedRadio.djName || '',
    artists,
    artistId: artists[0] && artists[0].id,
    album: mappedRadio.name || album.name || 'Podcast',
    cover: p.coverUrl || p.cover || p.blurCoverUrl || mappedRadio.cover || album.picUrl || '',
    duration: p.duration || mainSong.dt || mainSong.duration || 0,
    fee: mainSong.fee,
    djName: mappedRadio.djName || dj.nickname || '',
    radioName: mappedRadio.name || '',
    desc: p.description || p.desc || '',
    createTime: p.createTime || 0,
    serialNum: p.serialNum || p.serial || 0
  }
}

function mapPodcastVoice(v: any): any {
  v = v || {}
  const raw = v.resource || v.voice || v.data || v.program || v
  const mainSong = raw.mainSong || raw.song || raw.track || {}
  const radio = raw.radio || raw.djRadio || raw.voiceList || raw.podcast || {}
  const playableId = raw.trackId || raw.songId || raw.mainSongId || mainSong.id || raw.id
  return {
    type: 'podcast',
    source: 'podcast',
    sourceType: 'podcast-voice',
    id: playableId,
    programId: raw.programId || raw.voiceId || raw.id,
    radioId: radio.id || radio.radioId || radio.voiceListId || raw.radioId || raw.voiceListId,
    name: raw.name || raw.songName || raw.title || mainSong.name || '',
    artist: radio.name || radio.radioName || radio.voiceListName || raw.podcastName || raw.djName || 'Voice',
    album: radio.name || radio.radioName || raw.podcastName || 'Podcast',
    cover: raw.coverUrl || raw.cover || raw.picUrl || raw.coverImgUrl || radio.picUrl || radio.coverUrl || '',
    duration: raw.duration || raw.durationMs || mainSong.dt || mainSong.duration || 0,
    djName: raw.djName || (radio.dj && radio.dj.nickname) || '',
    radioName: radio.name || radio.radioName || raw.podcastName || '',
    desc: raw.desc || raw.description || ''
  }
}

function mapPodcastCollectionRadio(r: any, key: string): any {
  const radio = mapPodcastRadio(r)
  return {
    ...radio,
    type: 'podcast-radio',
    sourceType: 'podcast-radio',
    collectionKey: key || '',
    radioId: radio.id,
    name: radio.name,
    artist: radio.djName || radio.category || 'Podcast',
    album: radio.category || 'Podcast'
  }
}

function podcastCollectionMeta(key: string, items: any[]): any {
  const meta = ({
    collect: { key: 'collect', title: '收藏播客', sub: '你收藏的播客', itemType: 'radio' },
    created: { key: 'created', title: '创建播客', sub: '你创建的播客', itemType: 'radio' },
    liked: { key: 'liked', title: '喜欢的声音', sub: '收藏或最近喜欢的声音', itemType: 'voice' }
  } as Record<string, any>)[key] || { key, title: key, sub: '', itemType: 'radio' }
  const first = (items || [])[0] || {}
  return {
    ...meta,
    count: (items || []).length,
    cover: first.cover || first.picUrl || first.coverUrl || ''
  }
}

function firstArrayFrom(obj: any, keys: string[]): any[] {
  obj = obj || {}
  for (const key of keys) {
    const value = obj[key]
    if (Array.isArray(value)) return value
    if (value && Array.isArray(value.list)) return value.list
    if (value && Array.isArray(value.data)) return value.data
    if (value && Array.isArray(value.resources)) return value.resources
  }
  return []
}

function mapQQSmartSong(item: any): any {
  item = item || {}
  const mid = item.mid || item.songmid || item.id || ''
  return {
    provider: 'qq',
    source: 'qq',
    type: 'qq',
    id: mid,
    qqId: item.id || item.docid || '',
    mid,
    songmid: mid,
    name: item.name || item.title || '',
    artist: item.singer || '',
    artists: item.singer ? [{ name: item.singer }] : [],
    album: '',
    cover: '',
    duration: 0,
    fee: 0,
    playable: false
  }
}

function mapQQTrack(track: any, fallback?: any): any {
  track = track || {}
  fallback = fallback || {}
  const album = track.album || {}
  const artists = mapQQArtists(track.singer || [])
  const mid = track.mid || fallback.mid || fallback.songmid || ''
  const albumMid = album.mid || album.pmid || ''
  return {
    provider: 'qq',
    source: 'qq',
    type: 'qq',
    id: mid,
    qqId: track.id || fallback.qqId || fallback.id || '',
    mid,
    songmid: mid,
    mediaMid: track.file && track.file.media_mid,
    name: track.name || track.title || fallback.name || '',
    artist: artists.map((a) => a.name).join(' / ') || fallback.artist || '',
    artists: artists.length ? artists : fallback.artists || [],
    artistId: artists[0] && (artists[0].id || artists[0].mid),
    artistMid: artists[0] && artists[0].mid,
    album: album.name || album.title || fallback.album || '',
    albumMid,
    cover: qqAlbumCover(albumMid, 300) || fallback.cover || '',
    duration: (Number(track.interval) || 0) * 1000,
    fee: track.pay && Number(track.pay.pay_play) ? 1 : 0,
    playable: false
  }
}

async function qqSmartboxSearch(keywords: string, limit?: number): Promise<any[]> {
  const u = new URL(QQ_SMARTBOX_URL)
  u.searchParams.set('format', 'json')
  u.searchParams.set('key', keywords)
  u.searchParams.set('g_tk', '5381')
  u.searchParams.set('loginUin', '0')
  u.searchParams.set('hostUin', '0')
  u.searchParams.set('inCharset', 'utf8')
  u.searchParams.set('outCharset', 'utf-8')
  u.searchParams.set('notice', '0')
  u.searchParams.set('platform', 'yqq.json')
  u.searchParams.set('needNewCode', '0')
  const res = await fetch(u.toString(), { headers: QQ_HEADERS })
  const text = await res.text()
  const json = parseJSONText(text)
  const items = json && json.data && json.data.song && json.data.song.itemlist
  return (Array.isArray(items) ? items : [])
    .slice(0, Math.max(1, Math.min(limit || 6, 10)))
    .map(mapQQSmartSong)
}

async function qqSongDetail(mid: string, fallback?: any): Promise<any> {
  if (!mid) return fallback
  const json = await qqMusicRequest({
    comm: { ct: 24, cv: 0 },
    songinfo: {
      module: 'music.pf_song_detail_svr',
      method: 'get_song_detail_yqq',
      param: { song_mid: mid }
    }
  })
  const data = json && json.songinfo && json.songinfo.data
  return mapQQTrack(data && data.track_info, fallback)
}

const QQ_QUALITY_CANDIDATE_TEMPLATES = [
  { prefix: 'RS01', ext: '.flac', level: 'hires', label: 'Hi-Res FLAC' },
  { prefix: 'F000', ext: '.flac', level: 'lossless', label: '无损 FLAC' },
  { prefix: 'M800', ext: '.mp3', level: 'exhigh', label: '320k MP3' },
  { prefix: 'M500', ext: '.mp3', level: 'standard', label: '128k MP3' },
  { prefix: 'C400', ext: '.m4a', level: 'aac', label: 'AAC/M4A' }
]

function classifyQQPlaybackRestriction(info: any, session: any): any {
  const hasSession = typeof session === 'object' ? !!session.hasSession : !!session
  const hasPlaybackKey = typeof session === 'object' ? !!session.hasPlaybackKey : hasSession
  const rawMsg = String((info && (info.msg || info.tips || info.errmsg || info.message)) || '').trim()
  const code = Number((info && (info.result || info.code || info.errtype)) || 0)
  const lower = rawMsg.toLowerCase()
  if (!hasSession) {
    return playbackRestriction('qq', 'login_required', 'QQ 音乐需要登录或授权后才能获取播放地址', 'login', {
      code,
      rawMessage: rawMsg
    })
  }
  if (!hasPlaybackKey && code === 104003) {
    return playbackRestriction(
      'qq',
      'login_required',
      'QQ 音乐当前只拿到了网页登录状态，还缺少播放授权，请重新打开官方 QQ 音乐登录窗口完成授权',
      'login',
      { code, rawMessage: rawMsg, missingPlaybackKey: true }
    )
  }
  if (code === 104003) {
    return playbackRestriction(
      'qq',
      'copyright_unavailable',
      'QQ 音乐没有给当前版本返回播放地址，通常是版权、会员或官方版本限制，可以换一个搜索结果或切到网易云源',
      'switch_source',
      { code, rawMessage: rawMsg }
    )
  }
  if (/vip|会员|付费|购买|数字专辑|专辑|pay/.test(lower + rawMsg)) {
    return playbackRestriction('qq', 'paid_required', 'QQ 音乐歌曲需要会员、购买或数字专辑权限', 'upgrade', {
      code,
      rawMessage: rawMsg
    })
  }
  if (code && code !== 0) {
    return playbackRestriction(
      'qq',
      'copyright_unavailable',
      rawMsg || 'QQ 音乐版权暂不可播或仅官方客户端可用',
      'switch_source',
      { code, rawMessage: rawMsg }
    )
  }
  return playbackRestriction(
    'qq',
    'url_unavailable',
    'QQ 音乐没有返回播放地址，可能受版权、会员或官方客户端限制',
    'switch_source',
    { code, rawMessage: rawMsg }
  )
}

function decodeHtmlEntities(text: string): string {
  return String(text || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
}

function decodeQQLyricText(text: string): string {
  let raw = decodeHtmlEntities(String(text || '').trim())
  if (!raw) return ''
  const compact = raw.replace(/\s+/g, '')
  const looksBase64 = compact.length >= 8 && compact.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(compact)
  if (looksBase64 && !/^\s*\[/.test(raw)) {
    try {
      const decoded = Buffer.from(compact, 'base64').toString('utf8').replace(/^\uFEFF/, '')
      if (decoded && (decoded.includes('[') || /[\u4e00-\u9fa5]/.test(decoded))) raw = decoded
    } catch (e: any) {
      console.warn('[QQLyric] base64 decode failed:', e.message)
    }
  }
  return decodeHtmlEntities(raw).replace(/\r\n/g, '\n').trim()
}

// Weather电台 Logic
const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const OPEN_METEO_GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const WEATHER_IP_LOCATION_URL = 'http://ip-api.com/json/'
const WEATHER_DEFAULT_LOCATION = {
  name: '上海',
  country: 'China',
  latitude: 31.2304,
  longitude: 121.4737,
  timezone: 'Asia/Shanghai'
}

function openMeteoWeatherLabel(code: any): string {
  code = Number(code)
  if (code === 0) return '晴'
  if (code === 1 || code === 2) return '少云'
  if (code === 3) return '阴'
  if (code === 45 || code === 48) return '雾'
  if (code === 51 || code === 53 || code === 55) return '毛毛雨'
  if (code === 56 || code === 57) return '冻雨'
  if (code === 61 || code === 63 || code === 65) return '雨'
  if (code === 66 || code === 67) return '冻雨'
  if (code === 71 || code === 73 || code === 75 || code === 77) return '雪'
  if (code === 80 || code === 81 || code === 82) return '阵雨'
  if (code === 85 || code === 86) return '阵雪'
  if (code === 95 || code === 96 || code === 99) return '雷雨'
  return '天气'
}

function buildWeatherMood(weather: any, date?: Date): any {
  const now = date || new Date()
  const hour = now.getHours()
  const code = Number(weather && weather.weatherCode)
  const temp = Number(weather && weather.temperature)
  const apparent = Number(weather && weather.apparentTemperature)
  const rain = Number((weather && weather.precipitation) || 0)
  const humidity = Number((weather && weather.humidity) || 0)
  const wind = Number((weather && weather.windSpeed) || 0)
  const isNight = (weather && weather.isDay === 0) || hour < 6 || hour >= 20
  const isMorning = hour >= 5 && hour < 11
  const isDusk = hour >= 17 && hour < 20
  const isRain =
    rain > 0 || [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code)
  const isSnow = [71, 73, 75, 77, 85, 86].includes(code)
  const isCloud = [2, 3, 45, 48].includes(code)
  const isStorm = [95, 96, 99].includes(code)
  const feels = Number.isFinite(apparent) ? apparent : temp

  let mood = {
    key: 'clear',
    title: '晴朗电台',
    tagline: '让节奏亮一点，像窗边的光',
    energy: 0.62,
    warmth: 0.58,
    focus: 0.48,
    melancholy: 0.24,
    keywords: ['轻快 华语', 'city pop', 'indie pop', 'chill pop', '阳光 歌单']
  }
  if (isStorm) {
    mood = {
      key: 'storm',
      title: '雷雨电台',
      tagline: '低频更厚，适合把世界关小一点',
      energy: 0.46,
      warmth: 0.34,
      focus: 0.66,
      melancholy: 0.62,
      keywords: ['暗色 R&B', 'trip hop', '夜晚 电子', '氛围 摇滚', '雨夜 歌单']
    }
  } else if (isRain) {
    mood = {
      key: 'rain',
      title: '雨天电台',
      tagline: '留一点潮湿的空间给旋律',
      energy: 0.38,
      warmth: 0.42,
      focus: 0.64,
      melancholy: 0.66,
      keywords: ['雨天 R&B', 'lofi rainy', '华语 慢歌', 'dream pop', '雨夜 歌单']
    }
  } else if (isSnow || feels <= 3) {
    mood = {
      key: 'snow',
      title: '冷空气电台',
      tagline: '干净、慢速、带一点冬天的颗粒感',
      energy: 0.34,
      warmth: 0.28,
      focus: 0.72,
      melancholy: 0.54,
      keywords: ['冬天 民谣', 'ambient piano', '日系 冬天', 'indie folk', '安静 歌单']
    }
  } else if (feels >= 31 || humidity >= 78) {
    mood = {
      key: 'humid',
      title: '闷热电台',
      tagline: '降低密度，留出一点呼吸',
      energy: 0.48,
      warmth: 0.76,
      focus: 0.46,
      melancholy: 0.3,
      keywords: ['夏日 chill', 'bossa nova', 'city pop 夏天', '轻电子', '海边 歌单']
    }
  } else if (isCloud) {
    mood = {
      key: 'cloudy',
      title: '阴天电台',
      tagline: '不急着明亮，先让声音变软',
      energy: 0.4,
      warmth: 0.46,
      focus: 0.58,
      melancholy: 0.52,
      keywords: ['阴天 华语', 'indie rock mellow', 'neo soul', 'chillhop', '独立 民谣']
    }
  }

  if (isNight) {
    mood.key += '-night'
    mood.title = mood.key.startsWith('clear') ? '夜色电台' : mood.title.replace('电台', '夜听')
    mood.tagline = '音量放低一点，让夜色参与编曲'
    mood.energy = Math.min(mood.energy, 0.42)
    mood.focus = Math.max(mood.focus, 0.68)
    mood.melancholy = Math.max(mood.melancholy, 0.52)
    mood.keywords = ['夜晚 R&B', 'late night jazz', 'ambient', 'lofi sleep', '夜跑 歌单'].concat(
      mood.keywords.slice(0, 3)
    )
  } else if (isMorning) {
    mood.title = mood.key.startsWith('rain') ? '雨晨电台' : '早晨电台'
    mood.energy = Math.max(mood.energy, 0.52)
    mood.keywords = ['早晨 通勤', 'morning acoustic', '清晨 indie', '轻快 华语'].concat(
      mood.keywords.slice(0, 3)
    )
  } else if (isDusk) {
    mood.title = mood.key.startsWith('rain') ? '黄昏雨声' : '黄昏电台'
    mood.melancholy = Math.max(mood.melancholy, 0.48)
    mood.keywords = ['黄昏 city pop', '日落 歌单', '落日飞车', 'soul pop'].concat(
      mood.keywords.slice(0, 3)
    )
  }

  if (wind >= 28) {
    mood.energy = Math.max(mood.energy, 0.56)
    mood.keywords = ['公路 摇滚', 'windy day playlist'].concat(mood.keywords.slice(0, 4))
  }
  mood.keywords = Array.from(new Set(mood.keywords)).slice(0, 7)
  return mood
}

async function resolveOpenMeteoLocation(query: string): Promise<any> {
  const raw = String(query || '').trim()
  if (!raw) return WEATHER_DEFAULT_LOCATION
  try {
    const u = new URL(OPEN_METEO_GEOCODE_URL)
    u.searchParams.set('name', raw)
    u.searchParams.set('count', '1')
    u.searchParams.set('language', 'zh')
    u.searchParams.set('format', 'json')
    const res = await fetch(u.toString(), { headers: { 'User-Agent': UA } })
    const body = await res.json()
    const first = body && Array.isArray(body.results) && body.results[0]
    if (!first) return { ...WEATHER_DEFAULT_LOCATION, query: raw, fallback: true }
    return {
      name: first.name || raw,
      country: first.country || '',
      admin1: first.admin1 || '',
      latitude: first.latitude,
      longitude: first.longitude,
      timezone: first.timezone || 'auto'
    }
  } catch (e) {
    return { ...WEATHER_DEFAULT_LOCATION, query: raw, fallback: true }
  }
}

function clampNumber(value: any, min: number, max: number, fallback: number): number {
  if (value === null || value === undefined || value === '') return fallback
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

async function fetchOpenMeteoWeather(params: any): Promise<any> {
  params = params || {}
  let location: any
  const lat = clampNumber(params.lat, -90, 90, NaN)
  const lon = clampNumber(params.lon, -180, 180, NaN)
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    location = {
      name: String(params.city || params.name || '当前位置').trim() || '当前位置',
      country: '',
      latitude: lat,
      longitude: lon,
      timezone: params.timezone || 'auto'
    }
  } else {
    location = await resolveOpenMeteoLocation(params.city || params.q || params.location)
  }
  const u = new URL(OPEN_METEO_FORECAST_URL)
  u.searchParams.set('latitude', String(location.latitude))
  u.searchParams.set('longitude', String(location.longitude))
  u.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m'
  )
  u.searchParams.set('hourly', 'precipitation_probability,weather_code,temperature_2m')
  u.searchParams.set('forecast_days', '1')
  u.searchParams.set('timezone', location.timezone || 'auto')
  const res = await fetch(u.toString(), { headers: { 'User-Agent': UA } })
  const body = await res.json()
  const cur = (body && body.current) || {}
  const weather: any = {
    provider: 'open-meteo',
    location: {
      name: location.name,
      country: location.country || '',
      admin1: location.admin1 || '',
      latitude: location.latitude,
      longitude: location.longitude,
      timezone: body.timezone || location.timezone || '',
      fallback: !!location.fallback
    },
    label: openMeteoWeatherLabel(cur.weather_code),
    weatherCode: Number(cur.weather_code),
    temperature: Number(cur.temperature_2m),
    apparentTemperature: Number(cur.apparent_temperature),
    humidity: Number(cur.relative_humidity_2m),
    precipitation: Number(cur.precipitation || cur.rain || cur.showers || cur.snowfall || 0),
    cloudCover: Number(cur.cloud_cover),
    windSpeed: Number(cur.wind_speed_10m),
    windGusts: Number(cur.wind_gusts_10m),
    isDay: Number(cur.is_day),
    time: cur.time || '',
    updatedAt: Date.now()
  }
  weather.mood = buildWeatherMood(weather)
  return weather
}

async function fetchIpWeatherLocation(): Promise<any> {
  const u = new URL(WEATHER_IP_LOCATION_URL)
  u.searchParams.set('fields', 'status,message,country,regionName,city,lat,lon,timezone,query')
  u.searchParams.set('lang', 'zh-CN')
  const res = await fetch(u.toString(), { headers: { 'User-Agent': UA } })
  const body = await res.json()
  if (
    !body ||
    body.status !== 'success' ||
    !Number.isFinite(Number(body.lat)) ||
    !Number.isFinite(Number(body.lon))
  ) {
    const err: any = new Error(body && body.message ? body.message : 'IP_LOCATION_FAILED')
    err.body = body
    throw err
  }
  return {
    provider: 'ip-api',
    city: body.city || WEATHER_DEFAULT_LOCATION.name,
    region: body.regionName || '',
    country: body.country || '',
    latitude: Number(body.lat),
    longitude: Number(body.lon),
    timezone: body.timezone || 'auto',
    ip: body.query || ''
  }
}

function weatherRadioSeedQueries(mood: any): string[] {
  const key = String((mood && mood.key) || '')
  if (key.includes('rain') || key.includes('storm')) {
    return ['陈奕迅 阴天快乐', '周杰伦 雨下一整晚', '孙燕姿 遇见', '林俊杰 说散就散', '毛不易 消愁']
  }
  if (key.includes('snow') || key.includes('cloudy')) {
    return ['陈奕迅 好久不见', '莫文蔚 阴天', '李健 贝加尔湖畔', '朴树 平凡之路', '蔡健雅 达尔文']
  }
  if (key.includes('humid')) {
    return ['落日飞车 My Jinji', '告五人 爱人错过', '夏日入侵企画 想去海边', '陈绮贞 旅行的意义', '王若琳 Lost in Paradise']
  }
  if (key.includes('night')) {
    return ['方大同 特别的人', '陶喆 爱很简单', 'Frank Ocean Pink + White', '林忆莲 夜太黑', "Norah Jones Don't Know Why"]
  }
  return ['孙燕姿 天黑黑', '周杰伦 晴天', '五月天 温柔', '陈奕迅 稳稳的幸福', '王菲']
}

function fallbackWeatherForRadio(params: any, err: any): any {
  params = params || {}
  const name =
    String(params.city || params.q || params.location || WEATHER_DEFAULT_LOCATION.name).trim() ||
    WEATHER_DEFAULT_LOCATION.name
  return {
    provider: 'open-meteo',
    location: {
      name,
      country: '',
      admin1: '',
      latitude: null,
      longitude: null,
      timezone: params.timezone || WEATHER_DEFAULT_LOCATION.timezone,
      fallback: true
    },
    label: '天气暂时不可用',
    weatherCode: null,
    temperature: null,
    apparentTemperature: null,
    humidity: null,
    precipitation: null,
    cloudCover: null,
    windSpeed: null,
    windGusts: null,
    isDay: null,
    time: '',
    updatedAt: Date.now(),
    error: (err && err.message) || '',
    mood: {
      key: 'fallback',
      title: '临时电台',
      tagline: '天气暂时没有回来，先放一组稳妥的歌',
      energy: 0.54,
      warmth: 0.55,
      focus: 0.55,
      melancholy: 0.35,
      keywords: ['华语 流行', 'indie pop', 'city pop', '轻快 歌单', 'chill pop']
    }
  }
}

function uniqueSongsByKey(songs: any[]): any[] {
  const seen = new Set()
  const out: any[] = []
  ;(songs || []).forEach((song) => {
    const key = String((song && (song.id || song.name + '|' + song.artist)) || '').trim()
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push(song)
  })
  return out
}

function isLowSignalWeatherSong(song: any): boolean {
  const text = String(
    [song && song.name, song && song.artist, song && song.album].filter(Boolean).join(' ')
  ).toLowerCase()
  if (!text) return true
  if (/(^|[\s\-_/])ai(?:\s*(歌|歌曲|音乐|cover|翻唱|生成|作曲|演唱|女声|男声)|$|[\s\-_/])/i.test(text)) {
    return true
  }
  if (/suno|udio|人工智慧|人工智能|生成歌曲|ai歌曲|虚拟歌手|测试音频|demo|beat\s*maker/i.test(text)) {
    return true
  }
  if (
    /翻自|翻唱|cover|remix|伴奏|纯音乐|钢琴|dj|live\s*版|live版|唯美钢琴|karaoke|instrumental/i.test(
      text
    )
  ) {
    return true
  }
  if (/白噪音|雨声|睡眠|助眠|冥想|疗愈频率|环境音|自然声音|asmr/i.test(text)) return true
  if (
    /[(（](r&b|lofi|jazz|dj|edm|trap|remix|伴奏|纯音乐|钢琴|电子|治愈|古风|女声|男声|英文|中文版|抖音|ai)[)）]/i.test(
      text
    )
  ) {
    return true
  }
  if (/^(纯音乐|轻音乐|治愈系|放松|睡眠|雨天|阴天|夜晚|夏日|海边)$/i.test(String(song.name || '').trim())) {
    return true
  }
  return false
}

function scoreWeatherSong(song: any, mood: any): number {
  const text = String((song && song.name || '') + ' ' + (song && song.artist || '') + ' ' + (song && song.album || '')).toLowerCase()
  let score = 0
  if (song && song.cover) score += 4
  if (song && song.duration) score += 2
  if (song && song.weatherSource === 'daily') score += 6
  if (song && song.weatherSource === 'private') score += 4
  if (
    /周杰伦|陈奕迅|孙燕姿|五月天|王菲|陶喆|方大同|林俊杰|蔡健雅|莫文蔚|李健|毛不易|告五人|落日飞车|陈绮贞|朴树/.test(
      text
    )
  ) {
    score += 10
  }
  const key = String((mood && mood.key) || '')
  if (key.includes('rain') && /雨|阴|暗|慢|r&b|soul|陈奕迅|林俊杰|孙燕姿/.test(text)) score += 5
  if (key.includes('humid') && /夏|海|city|pop|落日|告五人|方大同|陶喆/.test(text)) score += 5
  if (key.includes('night') && /夜|moon|jazz|soul|r&b|方大同|陶喆|王菲/.test(text)) score += 5
  if (key.includes('cloudy') && /阴|民谣|indie|陈绮贞|朴树|李健/.test(text)) score += 5
  return score
}

function weatherArtistKey(song: any): string {
  const raw = String((song && song.artist) || (song && song.name) || '').split(/\s*\/\s*|,|&/)[0] || ''
  return raw.trim().toLowerCase() || 'unknown'
}

function weatherTitleKey(song: any): string {
  return String((song && song.name) || '')
    .toLowerCase()
    .replace(/[(（][^(（)*[)）]/g, '')
    .replace(/[\s._\-·'’’“”《》〈〉[\]\\/|]+/g, '')
    .trim()
}

function uniqueWeatherTitles(sorted: any[]): any[] {
  const seen = new Set()
  const out: any[] = []
  ;(sorted || []).forEach((song) => {
    const key = weatherTitleKey(song)
    if (key && seen.has(key)) return
    if (key) seen.add(key)
    out.push(song)
  })
  return out
}

function diversifyWeatherSongs(sorted: any[], artistLimit: number): any[] {
  const primary: any[] = []
  const deferred: any[] = []
  const counts = new Map()
  ;(sorted || []).forEach((song) => {
    const key = weatherArtistKey(song)
    const count = counts.get(key) || 0
    if (count < artistLimit) {
      primary.push(song)
      counts.set(key, count + 1)
    } else {
      deferred.push(song)
    }
  })
  return primary.length >= 8 ? primary : primary.concat(deferred.slice(0, 8 - primary.length))
}

function orderWeatherSongs(songs: any[], mood: any): any[] {
  const sorted = uniqueSongsByKey(songs)
    .filter((song) => song && song.name && song.id && !isLowSignalWeatherSong(song))
    .sort((a, b) => scoreWeatherSong(b, mood) - scoreWeatherSong(a, mood))
  return diversifyWeatherSongs(uniqueWeatherTitles(sorted), 2)
}

async function buildWeatherRadio(params: any): Promise<any> {
  let weather: any
  try {
    weather = await fetchOpenMeteoWeather(params)
  } catch (e: any) {
    console.warn('[WeatherRadio] weather provider failed, using fallback radio:', e.message)
    weather = fallbackWeatherForRadio(params, e)
  }
  const queries = weatherRadioSeedQueries(weather.mood)
  let songs: any[] = []
  const settled = await Promise.allSettled(
    queries.slice(0, 4).map((q) => {
      return cloudsearch({ keywords: q, limit: 6, cookie: userCookie }).then((r) => {
        const body: any = r.body || {}
        const raw = (body.result && body.result.songs) || []
        return raw.map(mapSongRecord)
      })
    })
  )
  settled.forEach((result) => {
    if (result.status === 'fulfilled' && Array.isArray(result.value)) {
      songs = songs.concat(result.value)
    }
  })
  if (songs.length < 10 && weather.mood && Array.isArray(weather.mood.keywords)) {
    const more = await Promise.allSettled(
      weather.mood.keywords.slice(0, 2).map((q) => {
        return cloudsearch({ keywords: q, limit: 6, cookie: userCookie }).then((r) => {
          const body: any = r.body || {}
          const raw = (body.result && body.result.songs) || []
          return raw.map(mapSongRecord)
        })
      })
    )
    more.forEach((result) => {
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        songs = songs.concat(result.value)
      }
    })
  }
  songs = orderWeatherSongs(songs, weather.mood)
  return {
    ok: true,
    weather,
    radio: {
      title: weather.mood.title,
      subtitle: weather.mood.tagline,
      seedQueries: queries.slice(0, 4),
      songs: songs.slice(0, 18),
      updatedAt: Date.now()
    }
  }
}

// BeatMap Cache logic
const BEATMAP_CACHE_DIR = process.env.MINERADIO_BEAT_CACHE_DIR || 'D:\\MineradioCache\\beatmaps'

function beatCacheRootInfo(): any {
  const dir = path.resolve(BEATMAP_CACHE_DIR)
  const root = path.parse(dir).root
  const drive = root ? root.replace(/[\\/]+$/, '').toUpperCase() : ''
  const allowed = !!root && !/^C:$/i.test(drive)
  const available = allowed && fs.existsSync(root)
  return { dir, root, drive, allowed, available }
}

function ensureBeatMapCacheDir(): string {
  const info = beatCacheRootInfo()
  if (!info.allowed) {
    const err: any = new Error('BEAT_CACHE_ON_C_DRIVE_DISABLED')
    err.code = 'BEAT_CACHE_ON_C_DRIVE_DISABLED'
    err.info = info
    throw err
  }
  if (!info.available) {
    const err: any = new Error('BEAT_CACHE_DRIVE_UNAVAILABLE')
    err.code = 'BEAT_CACHE_DRIVE_UNAVAILABLE'
    err.info = info
    throw err
  }
  fs.mkdirSync(info.dir, { recursive: true })
  return info.dir
}

function safeBeatMapCacheFile(key: string): string | null {
  const raw = String(key || '').trim()
  if (!raw || raw.length > 240) return null
  const hash = crypto.createHash('sha1').update(raw).digest('hex')
  const label =
    raw
      .replace(/[^a-z0-9_.-]+/gi, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'beatmap'
  return path.join(ensureBeatMapCacheDir(), `${label}-${hash}.json`)
}

function readBeatMapCache(key: string): any {
  const file = safeBeatMapCacheFile(key)
  if (!file || !fs.existsSync(file)) return null
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  return raw && raw.map ? raw : null
}

function compactBeatMapCachePayload(body: any): any {
  const key = String((body && body.key) || '').trim()
  const map = body && body.map
  if (!key || !map || typeof map !== 'object') return null
  return {
    v: 1,
    key,
    savedAt: Date.now(),
    meta: {
      duration: Number(body && body.meta && body.meta.duration) || 0,
      title: String((body && body.meta && body.meta.title) || '').trim(),
      artist: String((body && body.meta && body.meta.artist) || '').trim()
    },
    map
  }
}

function writeBeatMapCache(body: any): any {
  const payload = compactBeatMapCachePayload(body)
  if (!payload) return { ok: false, error: 'INVALID_BEATMAP_CACHE_PAYLOAD' }
  const file = safeBeatMapCacheFile(payload.key)
  if (!file) return { ok: false, error: 'INVALID_BEATMAP_CACHE_KEY' }
  const tmp = file + '.tmp'
  try {
    fs.writeFileSync(tmp, JSON.stringify(payload), 'utf8')
    fs.renameSync(tmp, file)
    return { ok: true, savedAt: payload.savedAt, key: payload.key }
  } catch (e: any) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
    } catch (_) {}
    return { ok: false, error: e.message }
  }
}

// Router map directing URL requests to in-memory JS functions
const handlers: Record<string, (params: any, data: any) => Promise<any>> = {
  // App Config & Meta
  '/api/app/version': async () => {
    return {
      name: 'mineradio',
      productName: 'Mineradio',
      version: '2.0.0-alpha.1'
    }
  },

  // Discover & Weather Radio
  '/api/discover/home': async () => {
    const info = await getLoginInfo()
    const loggedIn = !!(info && info.loggedIn)
    if (!loggedIn) {
      return {
        loggedIn: false,
        user: null,
        dailySongs: [],
        playlists: [],
        podcasts: [],
        mode: 'starter',
        updatedAt: Date.now()
      }
    }
    const tasks = [
      personalized({ limit: 8, cookie: userCookie, timestamp: Date.now() } as any),
      dj_hot({ limit: 6, offset: 0, cookie: userCookie, timestamp: Date.now() } as any),
      recommend_resource({ cookie: userCookie, timestamp: Date.now() } as any),
      recommend_songs({ cookie: userCookie, timestamp: Date.now() } as any)
    ]
    const result = await Promise.allSettled(tasks)

    const personalizedBody: any =
      (result[0].status === 'fulfilled' && result[0].value && result[0].value.body) || {}
    const publicPlaylists = (personalizedBody.result || personalizedBody.data || [])
      .map((pl) => mapDiscoverPlaylist(pl, '推荐歌单'))
      .filter((pl) => pl.id && pl.name)
      .slice(0, 8)

    const podcastBody: any =
      (result[1].status === 'fulfilled' && result[1].value && result[1].value.body) || {}
    const podcastRaw = podcastBody.djRadios || podcastBody.djradios || podcastBody.radios || podcastBody.data || []
    const podcasts = (Array.isArray(podcastRaw) ? podcastRaw : [])
      .map(mapPodcastRadio)
      .filter((p) => p.id && !isLowSignalPodcastItem(p))
      .slice(0, 6)

    let privatePlaylists: any[] = []
    if (result[2].status === 'fulfilled' && result[2].value) {
      const body: any = result[2].value.body || {}
      const raw = body.recommend || body.data || []
      privatePlaylists = (Array.isArray(raw) ? raw : [])
        .map((pl) => mapDiscoverPlaylist(pl, '私人推荐'))
        .filter((pl) => pl.id && pl.name)
        .slice(0, 6)
    }

    let dailySongs: any[] = []
    if (result[3].status === 'fulfilled' && result[3].value) {
      const body: any = result[3].value.body || {}
      const raw = (body.data && (body.data.dailySongs || body.data.recommend)) || body.recommend || []
      dailySongs = (Array.isArray(raw) ? raw : [])
        .map(mapSongRecord)
        .filter((song) => song.id && song.name)
        .slice(0, 12)
    }

    return {
      loggedIn,
      user: loggedIn ? { userId: info.userId, nickname: info.nickname || '', avatar: info.avatar || '' } : null,
      dailySongs,
      playlists: privatePlaylists.concat(publicPlaylists).slice(0, 10),
      podcasts,
      updatedAt: Date.now()
    }
  },

  '/api/weather/radio': async (params) => {
    return await buildWeatherRadio(params)
  },

  '/api/weather/ip-location': async () => {
    return { ok: true, location: await fetchIpWeatherLocation() }
  },

  // BeatMap Cache
  '/api/beatmap/cache/status': async () => {
    try {
      const info = beatCacheRootInfo()
      return { ok: true, ...info }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  },

  '/api/beatmap/cache': async (params, data) => {
    if (params && params.key) {
      try {
        const entry = readBeatMapCache(params.key)
        return entry
          ? {
              ok: true,
              hit: true,
              key: entry.key || params.key,
              map: entry.map,
              meta: entry.meta || {},
              savedAt: entry.savedAt || 0
            }
          : { ok: true, hit: false, key: params.key }
      } catch (err: any) {
        const info = beatCacheRootInfo()
        return {
          ok: false,
          hit: false,
          enabled: false,
          mode: 'memory-only',
          key: params.key,
          reason: err.code || err.message || 'BEAT_CACHE_READ_FAILED',
          dir: info.dir
        }
      }
    }
    return writeBeatMapCache(data)
  },

  // NetEase Music Search
  '/api/search': async (params) => {
    const kw = String(params.keywords || '').trim()
    const limit = Math.max(4, Math.min(60, parseInt(params.limit || '12', 10) || 12))
    const offset = Math.max(0, parseInt(params.offset || '0', 10) || 0)

    const r = await cloudsearch({ keywords: kw, limit, offset, cookie: userCookie })
    const body: any = r.body || {}
    const raw = (body.result && body.result.songs) || []
    let mapped = raw.map(mapSongRecord)

    const missing = mapped.filter((s) => !s.cover && s.id)
    if (missing.length) {
      try {
        const detailResult = await song_detail({
          ids: missing.map((s) => s.id).join(','),
          cookie: userCookie
        })
        const detailSongs = (detailResult.body && (detailResult.body as any).songs) || []
        const idToPic: Record<string, string> = {}
        detailSongs.forEach((ds: any) => {
          if (ds && ds.id && ds.al && ds.al.picUrl) {
            idToPic[ds.id] = ds.al.picUrl
          }
        })
        mapped = mapped.map((s) => (s.cover ? s : { ...s, cover: idToPic[s.id] || '' }))
      } catch (e: any) {
        console.warn('[Search] backfill failed:', e.message)
      }
    }
    return mapped
  },

  // NetEase URL
  '/api/song/url': async (params) => {
    const id = String(params.id || '').trim()
    const quality = String(params.quality || '').trim()
    const loginInfo = await getLoginInfo()
    return await handleSongUrl(id, loginInfo, quality)
  },

  // NetEase QR Login
  '/api/login/qr/key': async () => {
    const r = await login_qr_key({ timestamp: Date.now() } as any)
    const key = r.body && r.body.data && (r.body.data as any).unikey
    return { key }
  },

  '/api/login/qr/create': async (params) => {
    const key = params.key
    const r = await login_qr_create({ key, qrimg: true, timestamp: Date.now() } as any)
    const d: any = r.body && r.body.data
    return { img: d && d.qrimg, url: d && d.qrurl }
  },

  '/api/login/qr/check': async (params) => {
    const key = params.key
    let r: any = await login_qr_check({ key, noCookie: true, timestamp: Date.now() } as any)
    let body: any = r.body || {}
    let code = Number(body.code || r.code)
    let msg = body.message || r.message || ''
    let cookie = readCookieFromResponse(r)

    if (code === 803 && !cookie) {
      try {
        const retry: any = await login_qr_check({ key, timestamp: Date.now() } as any)
        const retryCookie = readCookieFromResponse(retry)
        if (retryCookie) {
          r = retry
          body = retry.body || body
          code = Number(body.code || retry.code || code)
          msg = body.message || retry.message || msg
          cookie = retryCookie
        }
      } catch (retryErr: any) {
        console.warn('[Login] qr cookie retry failed:', retryErr.message)
      }
    }
    if (cookie) {
      saveCookie(cookie)
    }
    return { code, message: msg, cookie }
  },

  '/api/login/status': async () => {
    return await getLoginInfo()
  },

  '/api/login/cookie': async (_, data) => {
    const cookie = String(data.cookie || '').trim()
    if (!cookie) throw new Error('Missing cookie payload')
    saveCookie(cookie)
    return await getLoginInfo()
  },

  '/api/logout': async () => {
    try {
      if (userCookie) {
        await logout({ cookie: userCookie })
      }
    } catch (_) {}
    saveCookie('')
    return { ok: true }
  },

  // NetEase Playlists
  '/api/user/playlists': async (params) => {
    const info = await getLoginInfo()
    if (!info.loggedIn) return { loggedIn: false, playlists: [] }
    const limit = Math.max(10, Math.min(200, parseInt(params.limit || '100', 10) || 100))
    const r = await user_playlist({ uid: info.userId, limit, cookie: userCookie, timestamp: Date.now() } as any)
    const list = ((r.body && (r.body as any).playlist) || []).map((pl: any) => ({
      id: pl.id,
      name: pl.name,
      cover: pl.coverImgUrl || '',
      trackCount: pl.trackCount || 0,
      playCount: pl.playCount || 0,
      creator: (pl.creator && pl.creator.nickname) || '',
      subscribed: !!pl.subscribed,
      specialType: pl.specialType || 0
    }))
    return { loggedIn: true, userId: info.userId, playlists: list }
  },

  '/api/playlist/tracks': async (params) => {
    const id = String(params.id || '').trim()
    const limit = Math.max(10, Math.min(1000, parseInt(params.limit || '100', 10) || 100))
    const offset = Math.max(0, parseInt(params.offset || '0', 10) || 0)

    const r = await playlist_track_all({
      id,
      limit,
      offset,
      cookie: userCookie,
      timestamp: Date.now()
    } as any)
    const raw = (r.body && (r.body.songs || (r.body as any).tracks)) || []
    const tracks = raw.map(mapSongRecord).filter((s) => s.name && s.id)

    let playlist = { provider: 'netease', id, name: '', cover: '', trackCount: tracks.length }
    try {
      const detailResult = await playlist_detail({ id, s: 0, cookie: userCookie, timestamp: Date.now() } as any)
      const pl = (detailResult.body && (detailResult.body as any).playlist) || {}
      playlist = {
        provider: 'netease',
        id: String(pl.id || id),
        name: pl.name || '',
        cover: pl.coverImgUrl || '',
        trackCount: pl.trackCount || tracks.length
      }
    } catch (_) {}

    return { playlist, tracks }
  },

  // NetEase Song Like
  '/api/song/like/check': async (params) => {
    const info = await getLoginInfo()
    if (!info.loggedIn) return { loggedIn: false, liked: false }
    const id = Number(params.id)
    if (!id) return { loggedIn: true, liked: false }

    const r = await likelist({
      uid: info.userId,
      cookie: userCookie,
      timestamp: Date.now()
    } as any)
    const ids = (r.body && (r.body as any).ids) || []
    const liked = ids.some((x: any) => String(x) === String(id))
    return { loggedIn: true, liked }
  },

  '/api/song/like': async (params) => {
    const info = await getLoginInfo()
    if (!info.loggedIn) return { loggedIn: false, ok: false }
    const id = Number(params.id)
    const like = params.like !== 'false'

    const r = await like_song({
      id: String(id),
      like,
      cookie: userCookie,
      timestamp: Date.now()
    } as any)
    return { loggedIn: true, ok: Number(r.body && r.body.code) === 200 }
  },

  '/api/playlist/create': async (params) => {
    const info = await getLoginInfo()
    if (!info.loggedIn) return { loggedIn: false, ok: false, playlist: null }
    const name = String(params.name || '').trim()
    if (!name) throw new Error('Missing playlist name')

    const r = await playlist_create({
      name,
      cookie: userCookie,
      timestamp: Date.now()
    } as any)
    const pl = r.body && (r.body as any).playlist
    return {
      loggedIn: true,
      ok: Number(r.body && r.body.code) === 200,
      playlist: pl ? { id: pl.id, name: pl.name, cover: pl.coverImgUrl || '' } : null
    }
  },

  '/api/playlist/add-song': async (params) => {
    const info = await getLoginInfo()
    if (!info.loggedIn) return { loggedIn: false, ok: false }
    const pid = String(params.pid || params.playlistId || '').trim()
    const sid = String(params.sid || params.songId || '').trim()
    const op = params.op || 'add'

    const r = await playlist_track_add({
      op,
      pid,
      tracks: sid,
      cookie: userCookie,
      timestamp: Date.now()
    } as any)
    return { loggedIn: true, ok: Number(r.body && r.body.code) === 200 }
  },

  // NetEase Lyric
  '/api/lyric': async (params) => {
    const id = Number(params.id || params.songId)
    if (!id) throw new Error('Missing NetEase song id')

    const r = await lyric_new({
      id: String(id),
      cookie: userCookie,
      timestamp: Date.now()
    } as any)
    const body: any = r.body || {}
    const lrc = body.lrc || {}
    const yt = body.tlyric || {}
    const yrc = body.yrc || {}
    const roma = body.romalrc || {}

    return {
      provider: 'netease',
      id,
      lyric: lrc.lyric || '',
      tlyric: yt.lyric || '',
      yrc: yrc.lyric || '',
      roma: roma.lyric || '',
      qrc: '',
      romaText: '',
      source: lrc.lyric ? 'netease-lyric_new' : 'netease-empty'
    }
  },

  // NetEase Song Comments
  '/api/song/comments': async (params) => {
    const id = String(params.id || params.songId || '').trim()
    if (!id) throw new Error('Missing song id')
    const limit = Math.max(4, Math.min(100, parseInt(params.limit || '20', 10) || 20))
    const offset = Math.max(0, parseInt(params.offset || '0', 10) || 0)

    const r = await comment_music({
      id,
      limit,
      offset,
      cookie: userCookie,
      timestamp: Date.now()
    } as any)
    const body: any = r.body || {}
    const hotList = body.hotComments || []
    const normalList = body.comments || []
    const raw = offset === 0 && hotList.length ? hotList : normalList

    const comments = raw.map((c: any) => ({
      id: c.commentId || '',
      content: c.content || '',
      likedCount: Number(c.likedCount) || 0,
      time: Number(c.time) || 0,
      user: {
        id: String((c.user && c.user.userId) || ''),
        nickname: (c.user && c.user.nickname) || '网易云用户',
        avatar: (c.user && c.user.avatarUrl) || ''
      }
    }))
    return {
      provider: 'netease',
      id,
      total: Number(body.total) || comments.length,
      comments,
      hot: !!(offset === 0 && hotList.length)
    }
  },

  // NetEase Artist Detail
  '/api/artist/detail': async (params) => {
    const id = String(params.id || params.artistId || '').trim()
    if (!id) throw new Error('Missing artist id')
    const limit = Math.max(10, Math.min(100, parseInt(params.limit || '50', 10) || 50))

    const [detailRes, songsRes] = await Promise.all([
      artist_detail({ id, cookie: userCookie } as any),
      artist_songs({ id, limit, cookie: userCookie } as any)
    ])

    const detailData: any = detailRes.body && (detailRes.body as any).data
    const artist = detailData && detailData.artist
    const rawSongs = (songsRes.body && (songsRes.body as any).songs) || []
    const songs = rawSongs.map(mapSongRecord).filter((s) => s.name && s.id)

    return {
      provider: 'netease',
      artist: artist
        ? {
            provider: 'netease',
            id: String(artist.id),
            name: artist.name || '',
            avatar: artist.cover || artist.picUrl || '',
            fans: 0,
            musicSize: artist.musicSize || songs.length,
            albumSize: artist.albumSize || 0,
            mvSize: artist.mvSize || 0
          }
        : null,
      total: artist ? artist.musicSize || songs.length : songs.length,
      songs
    }
  },

  // NetEase Podcast APIs
  '/api/podcast/search': async (params) => {
    const kw = String(params.keywords || '').trim()
    const limit = Math.max(4, Math.min(60, parseInt(params.limit || '12', 10) || 12))
    const offset = Math.max(0, parseInt(params.offset || '0', 10) || 0)

    const r = await cloudsearch({
      keywords: kw,
      type: 1009,
      limit,
      offset,
      cookie: userCookie
    } as any)
    const body: any = r.body || {}
    const raw = (body.result && body.result.djRadios) || []
    return raw.map(mapPodcastRadio).filter((p) => p.id)
  },

  '/api/podcast/hot': async (params) => {
    const limit = Math.max(4, Math.min(60, parseInt(params.limit || '12', 10) || 12))
    const offset = Math.max(0, parseInt(params.offset || '0', 10) || 0)

    const r = await dj_hot({ limit, offset, cookie: userCookie, timestamp: Date.now() } as any)
    const body: any = r.body || {}
    const raw = body.djRadios || body.djradios || body.radios || []
    return (Array.isArray(raw) ? raw : []).map(mapPodcastRadio).filter((p) => p.id)
  },

  '/api/podcast/detail': async (params) => {
    const id = String(params.id || params.radioId || '').trim()
    if (!id) throw new Error('Missing podcast/radio id')

    const r = await dj_detail({ rid: id, cookie: userCookie, timestamp: Date.now() } as any)
    const radio = r.body && (r.body as any).djRadio
    return radio ? mapPodcastRadio(radio) : null
  },

  '/api/podcast/programs': async (params) => {
    const id = String(params.id || params.radioId || '').trim()
    if (!id) throw new Error('Missing podcast/radio id')
    const limit = Math.max(4, Math.min(100, parseInt(params.limit || '30', 10) || 30))
    const offset = Math.max(0, parseInt(params.offset || '0', 10) || 0)
    const asc = params.asc === 'true'

    const r = await dj_program({
      rid: id,
      limit,
      offset,
      asc,
      cookie: userCookie,
      timestamp: Date.now()
    } as any)
    const body: any = r.body || {}
    const raw = body.programs || []
    const programs = raw.map((x) => mapPodcastProgram(x)).filter((p) => p.id)
    return {
      radioId: id,
      total: Number(body.count) || programs.length,
      programs
    }
  },

  '/api/podcast/my': async () => {
    const info = await getLoginInfo()
    if (!info.loggedIn) return { loggedIn: false, collections: [] }

    const collectTask = fetchMyPodcastItems('collect', info, 4, 0)
    const createdTask = fetchMyPodcastItems('created', info, 4, 0)
    const likedTask = fetchMyPodcastItems('liked', info, 4, 0)
    const results = await Promise.allSettled([collectTask, createdTask, likedTask])

    const collections: any[] = []
    const keys = ['collect', 'created', 'liked']
    results.forEach((res, idx) => {
      const key = keys[idx]
      if (res.status === 'fulfilled') {
        collections.push(podcastCollectionMeta(key, res.value.items))
      } else {
        collections.push(podcastCollectionMeta(key, []))
      }
    })
    return { loggedIn: true, collections }
  },

  '/api/podcast/my/items': async (params) => {
    const info = await getLoginInfo()
    if (!info.loggedIn) return { loggedIn: false, items: [] }
    const key = String(params.key || '').trim()
    const limit = parseInt(params.limit || '30', 10) || 30
    const offset = parseInt(params.offset || '0', 10) || 0

    const res = await fetchMyPodcastItems(key, info, limit, offset)
    return { loggedIn: true, ...res }
  },

  '/api/podcast/dj-beatmap': async (params) => {
    const pid = String(params.pid || params.programId || '').trim()
    if (!pid) throw new Error('Missing program id')

    const detailResult = await dj_program({
      rid: pid,
      limit: 1,
      cookie: userCookie,
      timestamp: Date.now()
    } as any)
    const body: any = detailResult.body || {}
    const p = body.programs && body.programs[0]
    const mainSong = p && p.mainSong
    if (!mainSong || !mainSong.id) {
      return { ok: false, error: 'NO_PODCAST_MAIN_TRACK' }
    }

    const songID = String(mainSong.id)
    const entry = readBeatMapCache(songID)
    if (entry) {
      return {
        ok: true,
        hit: true,
        key: songID,
        map: entry.map,
        meta: entry.meta || {}
      }
    }
    return { ok: true, hit: false, key: songID }
  },

  // QQ Music Search
  '/api/qq/search': async (params) => {
    const kw = String(params.keywords || params.key || '').trim()
    const limit = Math.max(4, Math.min(20, parseInt(params.limit || '8', 10) || 8))
    const songs = await handleQQSearch(kw, limit)
    return { provider: 'qq', songs }
  },

  // QQ Music URL
  '/api/qq/song/url': async (params) => {
    const mid = String(params.mid || params.id || '').trim()
    const mediaMid = String(params.mediaMid || params.media_mid || '').trim()
    const quality = String(params.quality || '').trim()
    return await handleQQSongUrl(mid, mediaMid, quality)
  },

  // QQ Music Lyric
  '/api/qq/lyric': async (params) => {
    const mid = String(params.mid || params.songmid || '').trim()
    const id = String(params.id || params.qqId || '').trim()
    return await handleQQLyric(mid, id)
  },

  // QQ Music Login Status
  '/api/qq/login/status': async () => {
    return await getQQLoginInfo()
  },

  '/api/qq/login/cookie': async (_, data) => {
    const cookie = String(data.cookie || '').trim()
    if (!cookie) throw new Error('Missing cookie payload')
    saveQQCookie(cookie)
    return await getQQLoginInfo()
  },

  '/api/qq/logout': async () => {
    saveQQCookie('')
    return { ok: true }
  },

  // QQ Music Playlists
  '/api/qq/user/playlists': async () => {
    return await handleQQUserPlaylists()
  },

  '/api/qq/playlist/tracks': async (params) => {
    const id = String(params.id || params.playlistId || '').trim()
    return await handleQQPlaylistTracks(id)
  },

  '/api/qq/artist/detail': async (params) => {
    const mid = String(params.mid || params.artistMid || '').trim()
    const limit = Math.max(10, Math.min(80, parseInt(params.limit || '36', 10) || 36))
    return await handleQQArtistDetail(mid, limit)
  },

  '/api/qq/song/comments': async (params) => {
    const id = String(params.id || params.qqId || '').trim()
    const mid = String(params.mid || params.songmid || '').trim()
    const limit = Math.max(4, Math.min(100, parseInt(params.limit || '20', 10) || 20))
    const offset = Math.max(0, parseInt(params.offset || '0', 10) || 0)
    return await handleQQSongComments(id, mid, limit, offset)
  }
}

function normalizeQQSongId(id: any): number {
  const n = String(id || '').replace(/\D/g, '')
  return n ? Number(n) : 0
}

async function handleQQLyric(mid: string, id: string): Promise<any> {
  const songMID = String(mid || '').trim()
  const songID = normalizeQQSongId(id)
  if (!songMID && !songID) return { provider: 'qq', error: 'Missing QQ song mid or id', lyric: '' }

  let lyricText = ''
  let transText = ''
  let qrcText = ''
  let romaText = ''
  let source = 'qq-musicu'

  try {
    const param: any = {}
    if (songMID) param.songMID = songMID
    if (songID) param.songID = songID
    const json = await qqMusicRequest({
      comm: { ct: 24, cv: 0 },
      lyric: {
        module: 'music.musichallSong.PlayLyricInfo',
        method: 'GetPlayLyricInfo',
        param
      }
    }, { cookie: true })
    const data = json && json.lyric && json.lyric.data
    lyricText = decodeQQLyricText(data && data.lyric)
    transText = decodeQQLyricText(data && data.trans)
    qrcText = decodeQQLyricText(data && data.qrc)
    romaText = decodeQQLyricText(data && data.roma)
  } catch (e: any) {
    console.warn('[QQLyric] musicu failed:', e.message)
  }

  if (!lyricText && songMID) {
    try {
      const body = await qqGetJSON('https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg', {
        songmid: songMID,
        songtype: '0',
        format: 'json',
        nobase64: '1',
        g_tk: '5381',
        loginUin: qqCookieUin() || '0',
        hostUin: '0',
        inCharset: 'utf8',
        outCharset: 'utf-8',
        notice: '0',
        platform: 'yqq.json',
        needNewCode: '0'
      }, { headers: { Referer: 'https://y.qq.com/portal/player.html' } })
      lyricText = decodeQQLyricText(body && body.lyric)
      transText = decodeQQLyricText(body && (body.trans || body.tlyric)) || transText
      source = 'qq-legacy'
    } catch (e: any) {
      console.warn('[QQLyric] legacy failed:', e.message)
    }
  }

  return {
    provider: 'qq',
    id: songID || '',
    mid: songMID,
    lyric: lyricText,
    tlyric: transText,
    yrc: '',
    qrc: qrcText,
    roma: romaText,
    source: lyricText ? source : 'qq-empty'
  }
}

async function handleQQUserPlaylists(): Promise<any> {
  const info = await getQQLoginInfo()
  if (!info.loggedIn || !info.userId) return { loggedIn: false, provider: 'qq', playlists: [] }
  const uin = info.userId
  const createdReq = qqGetJSON('https://c.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss', {
    hostUin: 0,
    hostuin: uin,
    sin: 0,
    size: 200,
    g_tk: 5381,
    loginUin: uin,
    format: 'json',
    inCharset: 'utf8',
    outCharset: 'utf-8',
    notice: 0,
    platform: 'yqq.json',
    needNewCode: 0
  }, { headers: { Referer: 'https://y.qq.com/portal/profile.html' } })
  const collectReq = qqGetJSON('https://c.y.qq.com/fav/fcgi-bin/fcg_get_profile_order_asset.fcg', {
    ct: 20,
    cid: 205360956,
    userid: uin,
    reqtype: 3,
    sin: 0,
    ein: 80
  }, { headers: { Referer: 'https://y.qq.com/portal/profile.html' } })
  const [createdRaw, collectRaw] = await Promise.allSettled([createdReq, collectReq])
  const created = createdRaw.status === 'fulfilled' && createdRaw.value && createdRaw.value.data && Array.isArray(createdRaw.value.data.disslist)
    ? createdRaw.value.data.disslist.map((pl: any) => mapQQPlaylist(pl, 'created')) : []
  const collected = collectRaw.status === 'fulfilled' && collectRaw.value && collectRaw.value.data && Array.isArray(collectRaw.value.data.cdlist)
    ? collectRaw.value.data.cdlist.map((pl: any) => mapQQPlaylist(pl, 'collect')) : []
  const seen = new Set()
  const playlists = created.concat(collected).filter((pl: any) => {
    if (!pl.id || !pl.name || seen.has(pl.id)) return false
    if (isQzoneBackgroundPlaylist(pl)) return false
    seen.add(pl.id)
    return true
  }).sort((a: any, b: any) => Number(isQQFavoritePlaylist(b)) - Number(isQQFavoritePlaylist(a)))
  return { loggedIn: true, provider: 'qq', userId: uin, playlists }
}

function mapQQComment(raw: any): any {
  raw = raw || {}
  const user = raw.user || raw.uin || {}
  const nickname = raw.nick || raw.nickname || raw.encrypt_uin || user.nick || user.nickname || user.name || 'QQ 音乐用户'
  const avatar = raw.avatarurl || raw.avatar || user.avatarurl || user.avatar || ''
  const timeRaw = Number(raw.time || raw.commenttime || raw.createTime || 0) || 0
  return {
    id: raw.commentid || raw.commentId || raw.id || '',
    content: raw.rootcommentcontent || raw.content || raw.comment || '',
    likedCount: Number(raw.praisenum || raw.praise_num || raw.likedCount || 0) || 0,
    time: timeRaw && timeRaw < 10000000000 ? timeRaw * 1000 : timeRaw,
    user: {
      id: raw.encrypt_uin || raw.uin || user.uin || '',
      nickname,
      avatar
    }
  }
}

// Helper for fetching user podcasts
async function fetchMyPodcastItems(
  key: string,
  info: any,
  limit: number,
  offset: number
): Promise<any> {
  limit = Math.max(8, Math.min(60, Number(limit) || 30))
  offset = Math.max(0, Number(offset) || 0)
  if (key === 'collect') {
    const r = await dj_sublist({ limit, offset, cookie: userCookie, timestamp: Date.now() } as any)
    const raw = firstArrayFrom(r.body, ['djRadios', 'djradios', 'radios', 'data'])
    return { itemType: 'radio', items: raw.map((x) => mapPodcastCollectionRadio(x, key)).filter((x) => x.id) }
  }
  if (key === 'created') {
    const r = await user_audio({ uid: info.userId, cookie: userCookie, timestamp: Date.now() } as any)
    const raw = firstArrayFrom(r.body, ['data', 'djRadios', 'djradios', 'radios'])
    return { itemType: 'radio', items: raw.map((x) => mapPodcastCollectionRadio(x, key)).filter((x) => x.id) }
  }
  if (key === 'paid') {
    const r = await dj_paygift({ limit, offset, cookie: userCookie, timestamp: Date.now() } as any)
    const raw = firstArrayFrom(r.body, ['data', 'djRadios', 'djradios', 'radios'])
    return { itemType: 'radio', items: raw.map((x) => mapPodcastCollectionRadio(x, key)).filter((x) => x.id) }
  }
  if (key === 'liked') {
    let raw: any[] = []
    try {
      const recent = await record_recent_voice({ limit, cookie: userCookie, timestamp: Date.now() } as any)
      raw = firstArrayFrom(recent.body, ['data', 'list', 'resources'])
    } catch (e: any) {
      console.warn('[MyPodcastLiked] recent voice failed:', e.message)
    }
    return { itemType: 'voice', items: raw.map(mapPodcastVoice).filter((x) => x.id && x.name) }
  }
  return { itemType: 'radio', items: [] }
}

// QQ helper functions using native fetch
async function handleQQSearch(keywords: string, limit: number): Promise<any[]> {
  const kw = String(keywords || '').trim()
  if (!kw) return []
  console.log('[QQSearch]', kw, 'limit:', limit)
  const base = await qqSmartboxSearch(kw, limit)
  const detailed = await Promise.all(
    base.map(async (item) => {
      try {
        return await qqSongDetail(item.mid, item)
      } catch (e: any) {
        console.warn('[QQSearch] detail failed:', item.mid, e.message)
        return item
      }
    })
  )
  const seen = new Set()
  return detailed.filter((song) => {
    const key = song && (song.mid || song.id || song.name + '|' + song.artist)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return !!song.name
  })
}

async function handleQQSongUrl(mid: string, mediaMid: string, qualityPreference: string): Promise<any> {
  const songmid = String(mid || '').trim()
  if (!songmid) return { provider: 'qq', url: '', error: 'MISSING_MID', message: 'Missing QQ song mid' }
  const guid = String(10000000 + Math.floor(Math.random() * 90000000))
  const cookieObj = qqCookieObject()
  const uin = qqCookieUin(cookieObj) || '0'
  const musicKey = qqCookieMusicKey(cookieObj)
  const playbackKey = qqCookiePlaybackKey(cookieObj)
  const fileMediaMid = String(mediaMid || '').trim()
  const requestedQuality = normalizeQualityPreference(qualityPreference)
  const mediaIds: string[] = []
  if (fileMediaMid) mediaIds.push(fileMediaMid)
  if (songmid && !mediaIds.includes(songmid)) mediaIds.push(songmid)

  const fileCandidates = mediaIds.flatMap((mId) =>
    qualityCandidatesFrom(requestedQuality, QQ_QUALITY_CANDIDATE_TEMPLATES).map((item) => ({
      ...item,
      mediaId: mId,
      filename: item.prefix + mId + item.ext
    }))
  )
  const filenames = fileCandidates.map((item) => item.filename)
  const param: any = {
    guid,
    songmid: filenames.length ? filenames.map(() => songmid) : [songmid],
    songtype: filenames.length ? filenames.map(() => 0) : [0],
    uin,
    loginflag: 1,
    platform: '20'
  }
  if (filenames.length) param.filename = filenames
  const comm: any = { uin, format: 'json', ct: musicKey ? 19 : 24, cv: 0 }
  if (musicKey) comm.authst = musicKey

  const json = await qqMusicRequest(
    {
      comm,
      req_0: {
        module: 'vkey.GetVkeyServer',
        method: 'CgiGetVkey',
        param
      }
    },
    { cookie: true }
  )
  const data = json && json.req_0 && json.req_0.data
  const infos = data && Array.isArray(data.midurlinfo) ? data.midurlinfo : []
  const info = infos.find((item) => item && item.purl) || infos[0]
  const purl = info && info.purl
  if (purl) {
    const sip = (data.sip && data.sip[0]) || 'https://ws.stream.qqmusic.qq.com/'
    const fileMeta = fileCandidates.find((item) => item.filename === info.filename) || {}
    return {
      provider: 'qq',
      url: sip + purl,
      trial: false,
      playable: true,
      level: fileMeta.level || info.filename || '',
      quality: fileMeta.label || info.filename || '',
      filename: info.filename || '',
      requestedQuality
    }
  }
  const restriction = classifyQQPlaybackRestriction(info, {
    hasSession: !!(uin && musicKey),
    hasPlaybackKey: !!(uin && playbackKey)
  })
  return {
    provider: 'qq',
    url: '',
    playable: false,
    error: 'QQ_URL_UNAVAILABLE',
    loggedIn: !!(uin && musicKey),
    playbackKeyReady: !!(uin && playbackKey),
    restriction,
    reason: restriction.category,
    message: restriction.message,
    qqCode: info && (info.result || info.code || info.errtype),
    rawMessage: info && (info.msg || info.tips || info.errmsg || ''),
    tried: fileCandidates.map((item) => item.label + ' · ' + item.filename),
    requestedQuality
  }
}

async function handleQQPlaylistTracks(id: string): Promise<any> {
  const info = await getQQLoginInfo()
  if (!info.loggedIn || !info.userId) return { loggedIn: false, provider: 'qq', tracks: [] }
  const pid = String(id || '').trim()
  if (!pid) return { loggedIn: true, provider: 'qq', error: 'Missing QQ playlist id', tracks: [] }
  const result = await qqGetJSON(
    'https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg',
    {
      type: 1,
      utf8: 1,
      disstid: pid,
      loginUin: info.userId,
      format: 'json',
      inCharset: 'utf8',
      outCharset: 'utf-8',
      notice: 0,
      platform: 'yqq.json',
      needNewCode: 0
    },
    { headers: { Referer: 'https://y.qq.com/n/yqq/playlist' } }
  )
  const detail = result && result.cdlist && result.cdlist[0] ? result.cdlist[0] : {}
  const rawTracks = Array.isArray(detail.songlist) ? detail.songlist : []
  const tracks = rawTracks.map(mapQQPlaylistTrack).filter((s) => s.name && (s.mid || s.id))
  const playlist = {
    provider: 'qq',
    id: pid,
    name: detail.dissname || detail.diss_name || detail.name || '',
    cover: detail.logo || detail.diss_cover || '',
    trackCount: tracks.length
  }
  return { loggedIn: true, provider: 'qq', playlist, tracks }
}

async function handleQQArtistDetail(mid: string, limit: number): Promise<any> {
  const singerMid = String(mid || '').trim()
  const num = Math.max(10, Math.min(80, limit || 36))
  if (!singerMid) return { provider: 'qq', error: 'MISSING_SINGER_MID', artist: null, songs: [] }
  const json = await qqMusicRequest(
    {
      comm: { ct: 24, cv: 0 },
      singer: {
        module: 'music.web_singer_info_svr',
        method: 'get_singer_detail_info',
        param: { sort: 5, singermid: singerMid, sin: 0, num }
      }
    },
    { cookie: true }
  )
  const block = json && json.singer
  if (!block || Number(block.code || 0) !== 0) {
    return {
      provider: 'qq',
      error: (block && (block.message || block.msg || block.code)) || 'QQ_ARTIST_DETAIL_FAILED',
      artist: null,
      songs: []
    }
  }
  const data = block.data || {}
  const singerInfo = data.singer_info || data.singerInfo || {}
  const rawSongs = Array.isArray(data.songlist) ? data.songlist : []
  const songs = rawSongs
    .map((raw) => mapQQTrack(raw && (raw.track_info || raw.songInfo || raw.songinfo || raw.song) || raw, {}))
    .filter((song) => song && song.name && (song.mid || song.id))
  const matchedSongArtist = songs[0] && (songs[0].artists || []).find((a) => a && a.mid === singerMid)
  const artistMid = singerInfo.mid || singerMid
  const artistName = singerInfo.name || singerInfo.title || (matchedSongArtist && matchedSongArtist.name) || ''
  const totalSong = Number(data.total_song || data.song_count || 0) || songs.length
  return {
    provider: 'qq',
    artist: {
      provider: 'qq',
      id: singerInfo.id || '',
      mid: artistMid,
      name: artistName,
      avatar: singerInfo.pic || singerInfo.avatar || qqSingerAvatar(artistMid, 300),
      fans: Number(singerInfo.fans || 0) || 0,
      musicSize: totalSong,
      albumSize: Number(data.total_album || 0) || 0,
      mvSize: Number(data.total_mv || 0) || 0
    },
    total: totalSong,
    songs
  }
}

async function handleQQSongComments(
  id: string,
  mid: string,
  limit: number,
  offset: number
): Promise<any> {
  let topid = String(id || '').replace(/\D/g, '')
  if (!topid && mid) {
    try {
      const detail = await qqSongDetail(mid, { mid })
      topid = String((detail && (detail.qqId || detail.id)) || '').replace(/\D/g, '')
    } catch (e: any) {
      console.warn('[QQComments] detail fallback failed:', e.message)
    }
  }
  if (!topid) return { provider: 'qq', error: 'Missing QQ song id', comments: [] }
  const page = Math.max(0, Math.floor((offset || 0) / Math.max(1, limit || 20)))
  const uin = qqCookieUin() || '0'
  const body = await qqGetJSON(
    'https://c.y.qq.com/base/fcgi-bin/fcg_global_comment_h5.fcg',
    {
      g_tk: '5381',
      loginUin: uin,
      hostUin: '0',
      format: 'json',
      inCharset: 'utf8',
      outCharset: 'utf-8',
      notice: '0',
      platform: 'yqq.json',
      needNewCode: '0',
      cid: '205360772',
      reqtype: '2',
      biztype: '1',
      topid,
      cmd: '8',
      needmusiccrit: '0',
      pagenum: String(page),
      pagesize: String(limit || 20)
    },
    { headers: { Referer: 'https://y.qq.com/n/ryqq/songDetail/' + encodeURIComponent(mid || topid) } }
  )
  const hotList = body && body.hot_comment && body.hot_comment.commentlist
  const normalList = body && body.comment && body.comment.commentlist
  const raw = offset === 0 && Array.isArray(hotList) && hotList.length ? hotList : normalList || []
  const comments = (raw || []).map(mapQQComment).filter((c) => c.content)
  const total =
    Number(body && body.comment && (body.comment.commenttotal || body.comment.comment_total)) ||
    comments.length
  return {
    provider: 'qq',
    id: topid,
    total,
    comments,
    hot: !!(offset === 0 && Array.isArray(hotList) && hotList.length)
  }
}

// IPC Registration
export function registerMusicIpcHandlers(): void {
  initCookies()

  // Standard API requests
  ipcMain.handle('api-request', async (_event, { url, params, data }) => {
    const handler = handlers[url]
    if (!handler) {
      throw new Error(`Route not found: ${url}`)
    }
    try {
      return await handler(params || {}, data || {})
    } catch (error: any) {
      console.error(`[API Error] url: ${url}`, error)
      throw error
    }
  })

  // Window-based Login Handlers
  ipcMain.handle('netease-music-open-login', async (event) => {
    return openNeteaseMusicLoginWindow(getSenderWindow(event))
  })

  ipcMain.handle('netease-music-clear-login', async () => {
    return clearNeteaseMusicLoginSession()
  })

  ipcMain.handle('qq-music-open-login', async (event) => {
    return openQQMusicLoginWindow(getSenderWindow(event))
  })

  ipcMain.handle('qq-music-clear-login', async () => {
    return clearQQMusicLoginSession()
  })
}
