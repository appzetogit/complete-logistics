import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, CheckCircle2, Copy, Gift, Loader2, Share2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getCurrentDriver } from '../../services/registrationService';
import {
  getReferralSettingsContent,
  getReferralTranslationContent,
} from '../../../shared/services/referralTranslationService';
import {
  applyReferralSettingPlaceholders,
  buildReferralPreviewBlocks,
  DRIVER_REFERRAL_TRANSLATION_FIELDS,
  getStoredReferralLanguageCode,
} from '../../../shared/utils/referralTranslationFields';
import { useSettings } from '../../../../shared/context/SettingsContext';

const readStoredDriverInfo = () => {
  try {
    return JSON.parse(localStorage.getItem('driverInfo') || '{}');
  } catch {
    return {};
  }
};

const LEGACY_BRAND_REGEX = /\bzyder\b/gi;

const replaceLegacyReferralBrand = (value, appName) => {
  const safeAppName = String(appName || '').trim() || 'App';
  return String(value || '').replace(LEGACY_BRAND_REGEX, safeAppName);
};

const DriverReferral = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings } = useSettings();
  const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';
  const [activeTab, setActiveTab] = useState('refer');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [driverProfile, setDriverProfile] = useState(() => {
    const stored = readStoredDriverInfo();
    return {
      referralCode: stored.referralCode || '',
    };
  });
  const [translation, setTranslation] = useState({
    language_code: 'en',
    driver_referral: {
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
    const loadDriverReferral = async () => {
      setLoading(true);
      const languageCode = getStoredReferralLanguageCode('driver');
      const stored = readStoredDriverInfo();
      const fallbackDriverSection = {
        instant_referrer_user: '',
        instant_referrer_user_and_new_user: '',
        conditional_referrer_user_ride_count: '',
        conditional_referrer_user_earnings: '',
        dual_conditional_referrer_user_and_new_user_ride_count: '',
        dual_conditional_referrer_user_and_new_user_earnings: '',
        banner_text: '',
      };

      try {
        const [driverResponse, translationResponse, settingsResponse] = await Promise.all([
          getCurrentDriver(),
          getReferralTranslationContent(languageCode),
          getReferralSettingsContent('driver'),
        ]);

        const driver = driverResponse?.data || {};
        const translationData = translationResponse?.data || {};
        const settingsData = settingsResponse?.data || {};
        const hydratedDriverReferral = applyReferralSettingPlaceholders(
          translationData.driver_referral || fallbackDriverSection,
          settingsData,
        );

        setDriverProfile({
          referralCode: driver.referralCode || stored.referralCode || '',
        });
        setTranslation({
          language_code: translationData.language_code || languageCode,
          driver_referral: hydratedDriverReferral,
        });

        localStorage.setItem(
          'driverInfo',
          JSON.stringify({
            ...stored,
            referralCode: driver.referralCode || '',
          }),
        );
      } catch {
        try {
          const [translationResponse, settingsResponse] = await Promise.all([
            getReferralTranslationContent(languageCode),
            getReferralSettingsContent('driver'),
          ]);
          setTranslation({
            language_code: translationResponse?.data?.language_code || languageCode,
            driver_referral: applyReferralSettingPlaceholders(
              translationResponse?.data?.driver_referral || fallbackDriverSection,
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

    loadDriverReferral();
  }, []);

  const appName = settings.general?.app_name || 'App';
  const referralCode = driverProfile.referralCode || '';
  const normalizedDriverReferral = Object.fromEntries(
    Object.entries(translation.driver_referral || {}).map(([key, value]) => [
      key,
      replaceLegacyReferralBrand(value, appName),
    ]),
  );
  const bannerText = normalizedDriverReferral.banner_text || `${appName} Refer and Earn`;
  const infoBlocks = buildReferralPreviewBlocks(
    normalizedDriverReferral,
    DRIVER_REFERRAL_TRANSLATION_FIELDS,
  );
  const referralShareLink = referralCode
    ? `${window.location.origin}/taxi/driver/reg-phone?ref=${encodeURIComponent(referralCode)}`
    : '';

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
    const shareText = `${bannerText}\nJoin as a driver with my referral link and code ${referralCode}.\n${referralShareLink}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: bannerText,
          text: shareText,
          url: referralShareLink,
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
    <div className="min-h-screen bg-[#f5f7fb] font-sans p-5 pt-8 pb-10">
      <header className="mb-5 flex items-center gap-3">
        <button
          onClick={() => navigate(`${routePrefix}/profile`)}
          className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center shadow-sm"
        >
          <ArrowLeft size={18} className="text-gray-900" strokeWidth={2.3} />
        </button>
        <h1 className="text-[19px] font-semibold text-gray-900">Referrals</h1>
      </header>

      <div className="rounded-[28px] border border-gray-200 bg-white shadow-sm overflow-hidden max-w-md mx-auto">
        <div className="bg-[#1830b8] px-5 py-5 text-white flex items-center justify-between">
          <div>
            <p className="text-[26px] font-semibold leading-tight">{bannerText}</p>
            <p className="text-[11px] text-indigo-100 mt-1">Language: {translation.language_code?.toUpperCase() || 'EN'}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center">
            <Gift size={20} />
          </div>
        </div>

        <div className="px-4 py-4">
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <div className="rounded-xl border border-dashed border-gray-300 px-3 py-3 text-center">
              <p className="text-[18px] font-semibold text-gray-900 tracking-wide">
                {referralCode || 'Not available'}
              </p>
              <p className="text-[10px] text-gray-400 mt-1">Your referral code</p>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!referralCode}
              className="rounded-xl bg-[#1830b8] text-white px-4 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
            >
              {copied ? <CheckCircle2 size={15} /> : <Copy size={15} />}
              Copy
            </button>
            <button
              type="button"
              onClick={handleShare}
              disabled={!referralCode}
              className="rounded-xl bg-[#ef4444] text-white px-4 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
            >
              Share <Share2 size={15} />
            </button>
          </div>

          <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">Share link</p>
            <p className="mt-1 break-all text-[12px] text-gray-700">
              {referralShareLink || 'Share link will appear once your referral code is ready.'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-3">
            <button
              type="button"
              onClick={() => setActiveTab('refer')}
              className={`rounded-lg py-2 text-xs font-medium ${
                activeTab === 'refer' ? 'bg-white border border-gray-200 text-gray-900' : 'bg-gray-100 text-gray-500'
              }`}
            >
              Refer and earn
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`rounded-lg py-2 text-xs font-medium ${
                activeTab === 'history' ? 'bg-white border border-gray-200 text-gray-900' : 'bg-gray-100 text-gray-500'
              }`}
            >
              Referral history
            </button>
          </div>
        </div>

        <div className="px-4 pb-4 min-h-[340px]">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="animate-spin text-[#1830b8]" size={26} />
            </div>
          ) : activeTab === 'refer' ? (
            <div className="space-y-4">
              <h2 className="text-[18px] font-semibold text-gray-900">How it works?</h2>
              {infoBlocks.length === 0 ? (
                <p className="text-sm text-gray-400">Referral content will appear here after admin updates this language.</p>
              ) : (
                infoBlocks.map((block) => (
                  <div
                    key={block.key}
                    className="text-[14px] leading-6 text-gray-800 prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: block.html }}
                  />
                ))
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-5 py-8 text-center">
              <p className="text-sm font-medium text-gray-900">Referral history</p>
              <p className="text-xs text-gray-400 mt-2">Detailed driver referral history is not available on this screen yet.</p>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {copied ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 rounded-2xl bg-gray-900 text-white px-4 py-3 text-xs font-semibold shadow-xl"
          >
            Referral code copied
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

export default DriverReferral;
