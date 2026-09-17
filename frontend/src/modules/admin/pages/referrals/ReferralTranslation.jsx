import { useRef, useEffect, useState } from 'react';
import {
  ChevronRight,
  Copy,
  Languages,
  Loader2,
  Save,
  Smartphone,
  Type,
  RotateCcw,
  RotateCw,
  Bold,
  Italic,
  Link as LinkIcon,
  Image as ImageIcon,
  Table as TableIcon,
  Quote,
  Video,
  List as ListIcon,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  ChevronDown,
  ArrowLeft,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { adminService } from '../../services/adminService';
import {
  buildReferralPreviewBlocks,
  createEmptyReferralTranslationRecord,
  DRIVER_REFERRAL_TRANSLATION_FIELDS,
  USER_REFERRAL_TRANSLATION_FIELDS,
} from '../../../shared/utils/referralTranslationFields';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '../../../../shared/context/SettingsContext';

const inputClass =
  'w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none transition-colors';
const labelClass = 'block text-xs font-semibold text-gray-700 mb-1.5';

const ToolbarButton = ({ children, onClick, title, active = false }) => (
  <button
    type="button"
    title={title}
    onMouseDown={(e) => {
      e.preventDefault();
      onClick(e);
    }}
    className={`h-8 min-w-8 px-1.5 rounded flex items-center justify-center transition-colors border ${
      active 
        ? 'bg-yellow-50 border-yellow-200 text-yellow-600' 
        : 'border-transparent text-gray-600 hover:bg-gray-100'
    }`}
  >
    {children}
  </button>
);

const HtmlEditor = ({ label, value, onChange, plainText = false, appName = 'App' }) => {
  const editorRef = useRef(null);
  const [activeHeading, setActiveHeading] = useState('P');
  const [isFocused, setIsFocused] = useState(false);
  const [activeStates, setActiveStates] = useState({
    bold: false,
    italic: false,
    underline: false,
    insertUnorderedList: false,
    insertOrderedList: false,
  });

  useEffect(() => {
    if (!editorRef.current || plainText) {
      return;
    }

    // Set default paragraph separator
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
    } catch (e) {
      console.warn('Could not set default paragraph separator');
    }

    if (!isFocused && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '';
      updateActiveStates();
    }
  }, [plainText, value, isFocused]);

  const syncEditor = () => {
    if (plainText || !editorRef.current) {
      return;
    }
    const content = editorRef.current.innerHTML;
    if (content !== value) {
      onChange(content);
    }
    updateActiveStates();
  };

  const updateActiveStates = () => {
    if (typeof document === 'undefined') return;
    setActiveStates({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      insertUnorderedList: document.queryCommandState('insertUnorderedList'),
      insertOrderedList: document.queryCommandState('insertOrderedList'),
    });
  };

  const runCommand = (command, commandValue = null) => {
    if (!editorRef.current || plainText) {
      return;
    }
    
    editorRef.current.focus();
    
    try {
      document.execCommand(command, false, commandValue);
    } catch (err) {
      console.error('Error executing command:', command, err);
    }
    
    syncEditor();
  };

  const headings = [
    { label: 'Paragraph', value: 'P' },
    { label: 'Heading 1', value: 'H1' },
    { label: 'Heading 2', value: 'H2' },
    { label: 'Heading 3', value: 'H3' },
  ];

  return (
    <div className="space-y-1.5">
      <style>{`
        .custom-html-editor ul { list-style-type: disc !important; padding-left: 1.5rem !important; margin-bottom: 1rem !important; display: block !important; }
        .custom-html-editor ol { list-style-type: decimal !important; padding-left: 1.5rem !important; margin-bottom: 1rem !important; display: block !important; }
        .custom-html-editor li { display: list-item !important; margin-bottom: 0.25rem !important; }
        .custom-html-editor blockquote { border-left: 4px solid #e5e7eb; padding-left: 1rem; font-style: italic; margin-bottom: 1rem; }
        .custom-html-editor table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
        .custom-html-editor td { border: 1px solid #e5e7eb; padding: 0.5rem; }
      `}</style>
      <label className="text-xs font-bold text-gray-700">{label} *</label>
      {plainText ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`${inputClass} min-h-[80px] resize-none text-xs font-medium`}
          placeholder={`Enter ${label.toLowerCase()}...`}
        />
      ) : (
        <div className={`rounded-xl border bg-white overflow-hidden transition-all shadow-sm ${
          isFocused ? 'border-yellow-400 ring-1 ring-yellow-400/20' : 'border-gray-200'
        }`}>
          <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-100 p-1.5 bg-gray-50/50">
            <ToolbarButton title="Undo" onClick={() => runCommand('undo')}>
              <RotateCcw size={14} />
            </ToolbarButton>
            <ToolbarButton title="Redo" onClick={() => runCommand('redo')}>
              <RotateCw size={14} />
            </ToolbarButton>
            
            <div className="w-px h-4 bg-gray-200 mx-1" />

            <div className="relative group">
              <select
                value={activeHeading}
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const val = e.target.value;
                  setActiveHeading(val);
                  runCommand('formatBlock', val === 'P' ? '<p>' : val);
                }}
                className="h-8 pl-2 pr-6 bg-transparent text-xs font-bold text-gray-600 outline-none hover:bg-gray-100 rounded appearance-none cursor-pointer border-none"
              >
                {headings.map(h => (
                  <option key={h.value} value={h.value}>{h.label}</option>
                ))}
              </select>
              <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
            </div>

            <div className="w-px h-4 bg-gray-200 mx-1" />

            <ToolbarButton title="Bold" active={activeStates.bold} onClick={() => runCommand('bold')}>
              <Bold size={14} />
            </ToolbarButton>
            <ToolbarButton title="Italic" active={activeStates.italic} onClick={() => runCommand('italic')}>
              <Italic size={14} />
            </ToolbarButton>
            
            <div className="w-px h-4 bg-gray-200 mx-1" />

            <ToolbarButton title="Link" onClick={() => {
              const url = window.prompt('Enter URL:', 'https://');
              if(url) runCommand('createLink', url);
            }}>
              <LinkIcon size={14} />
            </ToolbarButton>
            <ToolbarButton title="Insert Image" onClick={() => {
              const url = window.prompt('Enter Image URL:');
              if(url) runCommand('insertImage', url);
            }}>
              <ImageIcon size={14} />
            </ToolbarButton>
            <ToolbarButton title="Table" onClick={() => {
              const rows = window.prompt('Number of rows:', '2');
              const cols = window.prompt('Number of columns:', '2');
              if(rows && cols) {
                let tableHtml = '<table border="1" style="width:100%; border-collapse: collapse; margin-bottom: 1rem;">';
                for(let i=0; i<parseInt(rows); i++) {
                  tableHtml += '<tr>';
                  for(let j=0; j<parseInt(cols); j++) {
                    tableHtml += '<td style="padding: 8px; border: 1px solid #ddd;">Cell</td>';
                  }
                  tableHtml += '</tr>';
                }
                tableHtml += '</table><p><br></p>';
                runCommand('insertHTML', tableHtml);
              }
            }}>
              <TableIcon size={14} />
            </ToolbarButton>
            <ToolbarButton title="Quote" onClick={() => runCommand('formatBlock', 'BLOCKQUOTE')}>
              <Quote size={14} />
            </ToolbarButton>
            <ToolbarButton title="Media" onClick={() => {
              const embed = window.prompt('Enter Video Embed Code (iframe) or URL:');
              if(embed) {
                if(embed.includes('<iframe')) {
                  runCommand('insertHTML', embed + '<p><br></p>');
                } else {
                  runCommand('insertHTML', `<video src="${embed}" controls style="max-width:100%;"></video><p><br></p>`);
                }
              }
            }}>
              <Video size={14} />
            </ToolbarButton>

            <div className="w-px h-4 bg-gray-200 mx-1" />

            <ToolbarButton title="Bullet List" active={activeStates.insertUnorderedList} onClick={() => runCommand('insertUnorderedList')}>
              <ListIcon size={14} />
            </ToolbarButton>
            <ToolbarButton title="Numbered List" active={activeStates.insertOrderedList} onClick={() => runCommand('insertOrderedList')}>
              <ListOrdered size={14} />
            </ToolbarButton>
            <ToolbarButton title="Align Left" onClick={() => runCommand('justifyLeft')}>
              <AlignLeft size={14} />
            </ToolbarButton>
            <ToolbarButton title="Align Center" onClick={() => runCommand('justifyCenter')}>
              <AlignCenter size={14} />
            </ToolbarButton>
          </div>
          
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={syncEditor}
            onFocus={() => {
              setIsFocused(true);
              if (!editorRef.current.innerHTML.trim()) {
                editorRef.current.innerHTML = '<p><br></p>';
              }
              updateActiveStates();
            }}
            onBlur={() => {
              setIsFocused(false);
              syncEditor();
            }}
            onKeyUp={updateActiveStates}
            onClick={updateActiveStates}
            className="min-h-[120px] px-4 py-2 text-xs text-gray-700 outline-none prose prose-xs max-w-none leading-relaxed overflow-y-auto bg-white custom-html-editor font-medium"
          />
          <div className="px-3 py-1 border-t border-gray-50 flex justify-end">
            <span className="text-[9px] text-gray-300 font-bold">Powered by {appName}</span>
          </div>
        </div>
      )}
    </div>
  );
};

const PreviewCard = ({ title, code, bannerText, blocks }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
    <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-100">
      <div className="w-8 h-8 rounded-lg bg-yellow-50 flex items-center justify-center text-yellow-600">
        <Smartphone size={16} />
      </div>
      <div>
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        <p className="text-[11px] text-gray-400 font-medium">Live mobile preview for the selected language.</p>
      </div>
    </div>

    <div className="mx-auto w-[230px] rounded-[28px] border-[6px] border-gray-900 bg-white shadow-xl overflow-hidden relative">
      {/* Notch */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-4 bg-gray-900 rounded-b-xl z-20" />
      
      <div className="px-4 pt-6 pb-3 flex items-center justify-between border-b border-gray-100">
        <span className="text-[13px] font-bold text-gray-900">Referrals</span>
        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Live</span>
      </div>

      <div className="bg-yellow-400 text-black px-4 py-5 flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-[16px] font-black leading-tight">{bannerText || 'Refer and Earn'}</p>
          <p className="text-[10px] text-yellow-900 font-medium">Share your code & get rewards</p>
        </div>
        <div className="w-8 h-8 rounded-xl bg-black/5 flex items-center justify-center backdrop-blur-sm">
          <Type size={16} />
        </div>
      </div>

      <div className="px-4 py-4 border-b border-gray-100 bg-gray-50/30">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div className="rounded-xl border border-dashed border-yellow-300 bg-white px-3 py-2 text-center">
            <p className="text-[13px] font-black text-gray-900 tracking-wider">{code}</p>
            <p className="text-[9px] font-bold text-gray-400 mt-0.5">Your code</p>
          </div>
          <button
            type="button"
            className="rounded-xl bg-yellow-400 text-black px-4 text-xs font-bold flex items-center gap-2 shadow-sm shadow-yellow-200"
          >
            <Copy size={12} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-3">
          <button type="button" className="rounded-xl bg-gray-900 text-white py-2 text-[10px] font-bold">
            Refer
          </button>
          <button type="button" className="rounded-xl bg-white border border-gray-200 text-gray-500 py-2 text-[10px] font-bold">
            History
          </button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 min-h-[200px] max-h-[250px] overflow-y-auto no-scrollbar">
        <h4 className="text-[11px] font-black text-gray-900 border-b border-gray-50 pb-2">How it works?</h4>
        {blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 opacity-20">
            <Languages size={24} />
            <p className="text-[10px] font-bold mt-2">No content</p>
          </div>
        ) : (
          blocks.map((block) => (
            <div key={block.key} className="space-y-1">
              <p className="text-[9px] font-black text-yellow-600">
                {block.label}
              </p>
              <div
                className="text-[10px] text-gray-600 font-medium leading-relaxed prose prose-sm max-w-none custom-html-editor"
                dangerouslySetInnerHTML={{ __html: block.html }}
              />
            </div>
          ))
        )}
      </div>

      <div className="px-4 pb-5 pt-2 bg-white">
        <button
          type="button"
          className="w-full rounded-xl bg-black text-white py-3 text-xs font-black shadow-md shadow-gray-200"
        >
          Refer now
        </button>
      </div>
    </div>
  </div>
);

const ReferralTranslation = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const appName = settings.general?.app_name || 'App';
  const [records, setRecords] = useState([]);
  const [selectedLanguageCode, setSelectedLanguageCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadTranslations = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await adminService.getReferralTranslations();
        const items = response?.data?.results || response?.data || [];
        const safeItems = items.length > 0 ? items : [createEmptyReferralTranslationRecord()];
        setRecords(safeItems);
        setSelectedLanguageCode((current) => current || safeItems[0]?.language_code || 'en');
      } catch (fetchError) {
        console.error('Fetch error:', fetchError);
        setError(fetchError?.response?.data?.message || 'Unable to load referral translation data.');
        toast.error('Failed to load translations');
      } finally {
        setLoading(false);
      }
    };

    loadTranslations();
  }, []);

  const selectedRecord =
    records.find((item) => item.language_code === selectedLanguageCode) || records[0] || createEmptyReferralTranslationRecord();

  const visibleLanguageRecords = records.filter(
    (item) => item.active || item.default_status || item._id || item.language_code === selectedLanguageCode,
  );

  const updateSelectedRecord = (sectionKey, fieldKey, nextValue) => {
    setRecords((current) =>
      current.map((item) =>
        item.language_code === selectedLanguageCode
          ? {
              ...item,
              [sectionKey]: {
                ...(item[sectionKey] || {}),
                [fieldKey]: nextValue,
              },
            }
          : item,
      ),
    );
    setShowSuccess(false);
  };

  const handleSave = async () => {
    if (!selectedRecord?.language_code) {
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response = await adminService.updateReferralTranslation(selectedRecord.language_code, {
        language_name: selectedRecord.language_name,
        user_referral: selectedRecord.user_referral,
        driver_referral: selectedRecord.driver_referral,
      });

      const savedRecord = response?.data;
      if (savedRecord) {
        setRecords((current) =>
          current.map((item) => (item.language_code === savedRecord.language_code ? savedRecord : item)),
        );
        setShowSuccess(true);
        toast.success(`Saved ${savedRecord.language_name || savedRecord.language_code} referral translation.`);
        setTimeout(() => setShowSuccess(false), 3000);
      }
    } catch (saveError) {
      console.error('Save error:', saveError);
      setError(saveError?.message || 'Unable to save referral translation.');
      toast.error('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const userPreviewBlocks = buildReferralPreviewBlocks(
    selectedRecord.user_referral,
    USER_REFERRAL_TRANSLATION_FIELDS,
  );
  const driverPreviewBlocks = buildReferralPreviewBlocks(
    selectedRecord.driver_referral,
    DRIVER_REFERRAL_TRANSLATION_FIELDS,
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFDF5] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-yellow-500" size={32} />
          <span className="text-sm text-gray-500 font-medium">Loading translations...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFDF5] p-4 lg:p-6">
      {/* HEADER ACTION BUTTONS */}
      <div className="mb-4 flex justify-end">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-yellow-400 text-black text-sm font-bold rounded-lg hover:bg-yellow-500 transition-colors shadow-sm disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save Changes
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <PreviewCard
          title="User App Preview"
          code="RYDONUSER"
          bannerText={selectedRecord.user_referral?.banner_text}
          blocks={userPreviewBlocks}
        />
        <PreviewCard
          title="Driver App Preview"
          code="RYDONDRV"
          bannerText={selectedRecord.driver_referral?.banner_text}
          blocks={driverPreviewBlocks}
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        {/* LANGUAGE TABS */}
        <div className="flex items-center border-b border-gray-100 bg-white px-4 overflow-x-auto no-scrollbar">
          {visibleLanguageRecords.map((lang) => (
            <button
              key={lang.language_code}
              onClick={() => {
                setSelectedLanguageCode(lang.language_code);
                setShowSuccess(false);
              }}
              className={`px-6 py-4 text-sm font-bold transition-all relative whitespace-nowrap ${
                selectedLanguageCode === lang.language_code
                  ? 'text-yellow-600'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {lang.language_name || lang.language_code.toUpperCase()}
              {selectedLanguageCode === lang.language_code && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-yellow-400 rounded-full" />
              )}
            </button>
          ))}
        </div>

        <div className="p-4 lg:p-6">
          <div className="space-y-8">
            {error && (
              <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600 animate-in fade-in">
                <AlertCircle size={18} />
                <span className="font-medium">{error}</span>
              </div>
            )}
            
            {showSuccess && (
              <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-4 py-3 rounded-lg border border-emerald-100 animate-in fade-in slide-in-from-bottom-2">
                <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 size={12} />
                </div>
                <span className="text-sm font-bold">Translations updated successfully</span>
              </div>
            )}

            {/* USER REFERRAL SECTION */}
            <div className="space-y-5">
              <div className="flex items-center gap-3 pb-2 border-b border-gray-50">
                <div className="w-9 h-9 rounded-lg bg-yellow-50 flex items-center justify-center text-yellow-600">
                  <Smartphone size={20} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-900">User Referral Content <span className="text-rose-500">*</span></h2>
                  <p className="text-[11px] text-gray-500 font-medium">Translate referral instructions for your customers.</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {USER_REFERRAL_TRANSLATION_FIELDS.map((field) => (
                  <HtmlEditor
                    key={field.key}
                    appName={appName}
                    label={field.label}
                    plainText={field.plainText}
                    value={selectedRecord.user_referral?.[field.key] || ''}
                    onChange={(nextValue) => updateSelectedRecord('user_referral', field.key, nextValue)}
                  />
                ))}
              </div>
            </div>

            {/* DRIVER REFERRAL SECTION */}
            <div className="space-y-5">
              <div className="flex items-center gap-3 pb-2 border-b border-gray-50">
                <div className="w-9 h-9 rounded-lg bg-yellow-50 flex items-center justify-center text-yellow-600">
                  <Type size={20} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-900">Driver Referral Content <span className="text-rose-500">*</span></h2>
                  <p className="text-[11px] text-gray-500 font-medium">Translate referral instructions for your service providers.</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {DRIVER_REFERRAL_TRANSLATION_FIELDS.map((field) => (
                  <HtmlEditor
                    key={field.key}
                    appName={appName}
                    label={field.label}
                    plainText={field.plainText}
                    value={selectedRecord.driver_referral?.[field.key] || ''}
                    onChange={(nextValue) => updateSelectedRecord('driver_referral', field.key, nextValue)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReferralTranslation;
