import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, CheckCircle2, Copy, Gift, Loader2, Share2 } from 'lucide-react';
// ... removed BottomNavbar import ...
import { userAuthService } from '../services/authService';
import {
  getReferralSettingsContent,
  getReferralTranslationContent,
} from '../../shared/services/referralTranslationService';
import {
  applyReferralSettingPlaceholders,
  buildReferralPreviewBlocks,
  getStoredReferralLanguageCode,
  USER_REFERRAL_TRANSLATION_FIELDS,
} from '../../shared/utils/referralTranslationFields';
import { useSettings } from '../../../shared/context/SettingsContext';
import { useUserTheme } from '../../../shared/context/UserThemeContext';


const readStoredUserInfo = () => {
  try {
    return JSON.parse(localStorage.getItem('userInfo') || '{}');
  } catch {
    return {};
  }
};

const LEGACY_BRAND_REGEX = /\bzyder\b/gi;

const replaceLegacyReferralBrand = (value, appName) => {
  const safeAppName = String(appName || '').trim() || 'App';
  return String(value || '').replace(LEGACY_BRAND_REGEX, safeAppName);
};

const Referral = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { theme } = useUserTheme();
  const isDark = theme === 'dark';
  const [activeTab, setActiveTab] = useState('refer');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(() => {
    const stored = readStoredUserInfo();
    return {
      referralCode: stored.referralCode || '',
      referralCount: Number(stored.referralCount || 0),
    };
  });
  const [translation, setTranslation] = useState({
    language_code: 'en',
    user_referral: {
      instant_referrer_user: '',
      instant_referrer_user_and_new_user: '',
      conditional_referrer_user_ride_count: '',
      conditional_referrer_user_earnings: '',
      dual_conditional_referrer_user_and_new_user_ride_count: '',
      dual_conditional_referrer_user_and_new_user_earnings: '',
      banner_text: '',
    },
  });

  useEffect(() => {
    const loadReferralPage = async () => {
      setLoading(true);

      const languageCode = getStoredReferralLanguageCode('user');
      const stored = readStoredUserInfo();
      const fallbackUserSection = {
        instant_referrer_user: '',
        instant_referrer_user_and_new_user: '',
        conditional_referrer_user_ride_count: '',
        conditional_referrer_user_earnings: '',
        dual_conditional_referrer_user_and_new_user_ride_count: '',
        dual_conditional_referrer_user_and_new_user_earnings: '',
        banner_text: '',
      };

      try {
        const [userResponse, translationResponse, settingsResponse] = await Promise.all([
          userAuthService.getCurrentUser(),
          getReferralTranslationContent(languageCode),
          getReferralSettingsContent('user'),
        ]);

        const user = userResponse?.data?.user || {};
        const translationData = translationResponse?.data || {};
        const settingsData = settingsResponse?.data || {};
        const hydratedUserReferral = applyReferralSettingPlaceholders(
          translationData.user_referral || fallbackUserSection,
          settingsData,
        );

        setProfile({
          referralCode: user.referralCode || stored.referralCode || '',
          referralCount: Number(user.referralCount || 0),
        });
        setTranslation({
          language_code: translationData.language_code || languageCode,
          user_referral: hydratedUserReferral,
        });

        localStorage.setItem(
          'userInfo',
          JSON.stringify({
            ...stored,
            referralCode: user.referralCode || '',
            referralCount: Number(user.referralCount || 0),
          }),
        );
      } catch {
        try {
          const [translationResponse, settingsResponse] = await Promise.all([
            getReferralTranslationContent(languageCode),
            getReferralSettingsContent('user'),
          ]);
          setTranslation({
            language_code: translationResponse?.data?.language_code || languageCode,
            user_referral: applyReferralSettingPlaceholders(
              translationResponse?.data?.user_referral || fallbackUserSection,
              settingsResponse?.data || {},
            ),
          });
        } catch {
          // Keep local fallback state.
        }
      } finally {
        setLoading(false);
      }
    };

    loadReferralPage();
  }, []);

  const appName = settings.general?.app_name || 'App';
  const referralCode = profile.referralCode || '';
  const normalizedUserReferral = Object.fromEntries(
    Object.entries(translation.user_referral || {}).map(([key, value]) => [
      key,
      replaceLegacyReferralBrand(value, appName),
    ]),
  );
  const bannerText = normalizedUserReferral.banner_text || `${appName} Refer and Earn`;
  const infoBlocks = buildReferralPreviewBlocks(
    normalizedUserReferral,
    USER_REFERRAL_TRANSLATION_FIELDS,
  );

  const handleCopy = async () => {
    if (!referralCode) {
      return;
    }

    try {
      await navigator.clipboard.writeText(referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failures silently.
    }
  };

  const handleShare = async () => {
    if (!referralCode) {
      return;
    }
    const signupLink = `${window.location.origin}/taxi/user/signup?ref=${encodeURIComponent(referralCode)}`;
    const shareText = `${bannerText}\nUse my referral code ${referralCode} to sign up.\n${signupLink}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: bannerText,
          text: shareText,
        });
        return;
      }
    } catch {
      // Fall through to desktop-friendly sharing options.
    }

    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failures and continue to WhatsApp fallback.
    }

    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
  };

  return (
    <div className={`min-h-screen max-w-lg mx-auto font-sans pb-28 transition-colors duration-300 ${isDark ? 'bg-slate-950 text-white' : 'bg-[#f5f7fb] text-slate-900'}`}>
      <header className={`px-5 pt-10 pb-4 sticky top-0 z-20 border-b transition-colors duration-300 ${isDark ? 'bg-slate-900/90 border-slate-800 text-white shadow-sm' : 'bg-white border-gray-100 text-slate-900 shadow-sm'}`}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className={`w-9 h-9 rounded-xl border flex items-center justify-center shadow-sm transition-all active:scale-95 cursor-pointer ${isDark ? 'border-slate-800 bg-slate-950 text-white' : 'border-gray-200 bg-white text-gray-900'}`}
          >
            <ArrowLeft size={18} className={isDark ? 'text-white' : 'text-slate-900'} strokeWidth={2.3} />
          </button>
          <div className="flex-1 text-center pr-12">
            <h1 className={`text-[19px] font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>Referrals</h1>
          </div>
        </div>
      </header>

      <div className="px-5 pt-5">
        <div className={`rounded-[28px] border shadow-sm overflow-hidden transition-colors ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'}`}>
          <div className={`px-5 py-5 flex items-center justify-between border-b ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-gradient-to-r from-amber-100 via-yellow-100 to-yellow-50 border-yellow-200/50'}`}>
            <div>
              <p className={`text-[26px] font-black leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>{bannerText}</p>
              <p className={`text-[11px] mt-1.5 ${isDark ? 'text-slate-400 font-medium' : 'text-slate-500 font-bold'}`}>Language: {translation.language_code?.toUpperCase() || 'EN'}</p>
            </div>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isDark ? 'bg-white/10 text-white' : 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-md shadow-indigo-500/20'}`}>
              <Gift size={20} />
            </div>
          </div>

          <div className="px-4 py-4">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <div className={`rounded-xl border border-dashed px-3 py-3 text-center transition-colors ${isDark ? 'border-slate-800 bg-slate-950/50' : 'border-gray-300 bg-white'}`}>
                <p className={`text-[18px] font-semibold tracking-wide ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {referralCode || 'Not available'}
                </p>
                <p className={`text-[10px] uppercase font-bold tracking-wider mt-1 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>Your referral code</p>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                disabled={!referralCode}
                className={`rounded-xl px-4 text-sm font-semibold flex items-center gap-2 transition-all duration-200 active:scale-95 disabled:opacity-50 ${isDark ? 'bg-white text-slate-950 hover:bg-slate-100' : 'bg-slate-950 text-white hover:bg-slate-900'}`}
              >
                {copied ? <CheckCircle2 size={15} /> : <Copy size={15} />}
                Copy
              </button>
            </div>

            <div className={`grid grid-cols-2 gap-2 mt-3 p-1 rounded-xl ${isDark ? 'bg-slate-950/40' : 'bg-slate-100'}`}>
              <button
                type="button"
                onClick={() => setActiveTab('refer')}
                className={`rounded-lg py-2 text-xs font-bold transition-all ${
                  activeTab === 'refer'
                    ? isDark
                      ? 'bg-slate-900 text-white border border-slate-800/80 shadow'
                      : 'bg-white border border-slate-200 text-slate-900 shadow-sm'
                    : isDark
                      ? 'text-slate-400 hover:text-slate-200'
                      : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Refer and earn
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`rounded-lg py-2 text-xs font-bold transition-all ${
                  activeTab === 'history'
                    ? isDark
                      ? 'bg-slate-900 text-white border border-slate-800/80 shadow'
                      : 'bg-white border border-slate-200 text-slate-900 shadow-sm'
                    : isDark
                      ? 'text-slate-400 hover:text-slate-200'
                      : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Referral history
              </button>
            </div>
          </div>

          <div className="px-4 pb-4 min-h-[340px]">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className={`animate-spin ${isDark ? 'text-white' : 'text-slate-900'}`} size={26} />
              </div>
            ) : activeTab === 'refer' ? (
              <div className="space-y-4">
                <h2 className={`text-[18px] font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>How it works?</h2>
                {infoBlocks.length === 0 ? (
                  <p className="text-sm text-slate-400">Referral content will appear here after admin updates this language.</p>
                ) : (
                  infoBlocks.map((block) => (
                     <div
                       key={block.key}
                       className={`text-[14px] leading-6 prose prose-sm max-w-none transition-colors ${isDark ? 'text-slate-300 prose-invert' : 'text-slate-800'}`}
                       dangerouslySetInnerHTML={{ __html: block.html }}
                     />
                  ))
                )}
              </div>
            ) : (
              <div className={`rounded-2xl border border-dashed px-5 py-8 text-center transition-colors ${isDark ? 'border-slate-800 bg-slate-950/30' : 'border-gray-200 bg-gray-50'}`}>
                <p className={`text-sm font-bold ${isDark ? 'text-slate-300' : 'text-slate-900'}`}>Successful referrals</p>
                <p className={`text-4xl font-extrabold mt-2 ${isDark ? 'text-white' : 'text-slate-950'}`}>{profile.referralCount}</p>
                <p className="text-xs text-slate-400 mt-2">Detailed referral history is not available on this screen yet.</p>
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleShare}
          disabled={!referralCode}
          className={`w-full rounded-2xl py-4 text-sm font-bold mt-5 flex items-center justify-center gap-2 transition-all duration-200 active:scale-95 shadow-lg disabled:opacity-50 ${isDark ? 'bg-white text-slate-950 hover:bg-slate-100' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
        >
          Refer now <Share2 size={16} />
        </button>
      </div>

      <AnimatePresence>
        {copied ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={`fixed bottom-24 left-1/2 -translate-x-1/2 rounded-2xl px-4 py-3 text-xs font-semibold shadow-xl border ${isDark ? 'bg-slate-900 text-white border-slate-800' : 'bg-slate-900 text-white border-transparent'}`}
          >
            Referral code copied
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

export default Referral;
