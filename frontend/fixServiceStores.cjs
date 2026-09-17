const fs = require('fs');
let file = fs.readFileSync('src/modules/admin/pages/price-management/ServiceStores.jsx', 'utf8');

file = file.replace(/const labelClass = 'mb-2 block text-\[11px\] font-black uppercase tracking-widest text-slate-400';/g, 
  "const labelClass = 'mb-2 block text-xs font-semibold text-slate-600';");

file = file.replace(/className=\"w-full py-2\.5 bg-slate-900 text-white rounded-xl font-black text-xs/g, 
  'className=\"w-full py-2.5 bg-yellow-400 text-black hover:bg-yellow-500 rounded-xl font-bold text-sm');

file = file.replace(/> COMMIT CONFIGURATION<\/button>/g, 
  '> Save Configuration</button>');

file = file.replace(/ style=\{\{ fontFamily: '\"Times New Roman\", Times, serif' \}\}/g, 
  '');

file = file.replace(/text-\[9px\] text-slate-400 uppercase tracking-widest font-black/g, 
  'text-xs text-slate-500 font-semibold mt-1');

file = file.replace(/text-\[9px\] text-slate-400 font-black uppercase tracking-widest/g, 
  'text-xs text-slate-500 font-semibold mt-1');

file = file.replace(/text-\[9px\] font-black text-slate-300 uppercase/g, 
  'text-xs font-semibold text-slate-400');

file = file.replace(/text-\[9px\] text-slate-400 font-medium italic leading-relaxed text-center uppercase tracking-widest/g, 
  'text-xs text-slate-500 font-medium italic text-center');

fs.writeFileSync('src/modules/admin/pages/price-management/ServiceStores.jsx', file);
