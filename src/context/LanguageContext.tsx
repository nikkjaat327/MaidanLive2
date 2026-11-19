import React, { createContext, useContext, useEffect, useState } from 'react';

export type AppLanguage = 'en' | 'hi';

const TRANSLATIONS: Record<string, { en: string; hi: string }> = {
  'nav.home': { en: 'Home', hi: 'होम' },
  'nav.live': { en: 'Live', hi: 'लाइव' },
  'nav.tournaments': { en: 'Tournaments', hi: 'टूर्नामेंट' },
  'nav.teams': { en: 'Teams', hi: 'टीमें' },
  'nav.players': { en: 'Players', hi: 'खिलाड़ी' },
  'nav.leaderboards': { en: 'Leaderboards', hi: 'लीडरबोर्ड' },
  'nav.replays': { en: 'Replays', hi: 'रीप्ले' },
  'nav.following': { en: 'Following', hi: 'फॉलोइंग' },
  'nav.notifications': { en: 'Alerts', hi: 'अलर्ट' },
  'nav.signIn': { en: 'Sign In', hi: 'लॉग इन' },
  'nav.register': { en: 'Register', hi: 'रजिस्टर' },
  'nav.admin': { en: 'Admin Portal', hi: 'एडमिन पोर्टल' },
  'hero.badge': { en: 'Grassroots Indian Sports Broadcasts', hi: 'भारतीय जमीनी खेल प्रसारण' },
  'hero.title': {
    en: 'Every Village Ground. Live Scores & Broadcasts.',
    hi: 'हर मैदान से लाइव स्कोर और सीधा प्रसारण।',
  },
  'hero.subtitle': {
    en: 'Cricket, Kabaddi, Football, and Volleyball matches streamed live with instant ball-by-ball and raid-by-raid scoreboards.',
    hi: 'क्रिकेट, कबड्डी, फुटबॉल और वॉलीबॉल मैचों का रियल-टाइम स्कोरबोर्ड और लाइव स्ट्रीमिंग।',
  },
  'hero.watchLive': { en: 'Watch Live Now', hi: 'अभी लाइव देखें' },
  'hero.browseTournaments': { en: 'Explore Tournaments', hi: 'टूर्नामेंट देखें' },
  'broadcast.live': { en: 'LIVE', hi: 'लाइव' },
  'broadcast.upcoming': { en: 'UPCOMING', hi: 'आगामी' },
  'broadcast.ended': { en: 'FINAL', hi: 'समाप्त' },
  'broadcast.score': { en: 'SCORE', hi: 'स्कोर' },
  'broadcast.hideScore': { en: 'HIDE SCORE', hi: 'स्कोर छुपाएं' },
  'broadcast.fullscreen': { en: 'Fullscreen', hi: 'फुलस्क्रीन' },
  'broadcast.exitFullscreen': { en: 'Exit', hi: 'बाहर निकलें' },
  'broadcast.viewers': { en: 'watching', hi: 'देख रहे हैं' },
  'broadcast.switching': {
    en: 'Switching live video feed...',
    hi: 'लाइव वीडियो फ़ीड बदला जा रहा है...',
  },
  'broadcast.lowDataWatch': {
    en: 'Tap to Load Video Stream (Low-Data Mode)',
    hi: 'वीडियो चलाने के लिए टैप करें',
  },
  'pwa.install': { en: 'Install App', hi: 'ऐप इंस्टॉल करें' },
  'pwa.offline': {
    en: 'You are offline. Viewing cached data — live scores will reconnect automatically.',
    hi: 'आप ऑफलाइन हैं। नेटवर्क आने पर लाइव स्कोर अपने आप जुड़ जाएगा।',
  },
  'common.allSports': { en: 'All Sports', hi: 'सभी खेल' },
  'common.noMatches': { en: 'No matches scheduled right now', hi: 'अभी कोई मैच उपलब्ध नहीं है' },
  'tournament.registerTeam': { en: 'Register Your Team', hi: 'अपनी टीम रजिस्टर करें' },
};

interface LanguageContextValue {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  toggleLanguage: () => void;
  t: (key: string, fallback?: string) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  setLanguage: () => {},
  toggleLanguage: () => {},
  t: (key, fallback) => TRANSLATIONS[key]?.en || fallback || key,
});

const LANG_STORAGE_KEY = 'maidanlive_lang';

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(() => {
    try {
      return window.localStorage.getItem(LANG_STORAGE_KEY) === 'hi' ? 'hi' : 'en';
    } catch {
      return 'en';
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, language);
    } catch {
      // Ignore storage error
    }
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = (lang: AppLanguage) => setLanguageState(lang);
  const toggleLanguage = () => setLanguageState((prev) => (prev === 'en' ? 'hi' : 'en'));
  const t = (key: string, fallback?: string) => {
    const entry = TRANSLATIONS[key];
    if (entry) return entry[language] || entry.en;
    return fallback || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
