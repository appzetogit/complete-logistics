const fs = require('fs');
const file = 'frontend/src/modules/admin/pages/price-management/ServiceLocation.jsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/indigo-([0-9]+)/g, 'yellow-');
content = content.replace(/blue-([0-9]+)/g, 'yellow-');
content = content.replace(/bg-yellow-600 text-white.*hover:bg-yellow-700/g, '!bg-[#FFC400] !text-[#0B1220] border-none hover:brightness-95');

// Make the text in top 3 cards black: text-[10px] font-black uppercase tracking-widest 
// Actually, I can just replace the whole text color for that section.
content = content.replace(/className=\{\	ext-\\[10px\\] font-black uppercase tracking-widest .*\\}/g, 'className=\"text-[10px] font-black uppercase tracking-widest text-[#0B1220]\"');

// The stats labels might be defined without backticks sometimes, let's just make it simple:
content = content.replace(/text-\\[10px\\] font-black uppercase tracking-widest \$\{i === 0 \? 'text-yellow-600' : 'text-gray-400'\}/g, 'text-[10px] font-black uppercase tracking-widest text-[#0B1220]');

// Compacting
content = content.replace(/p-8/g, 'p-4');
content = content.replace(/p-6/g, 'p-3');
content = content.replace(/p-5/g, 'p-3');
content = content.replace(/px-8/g, 'px-4');
content = content.replace(/py-8/g, 'py-4');
content = content.replace(/gap-8/g, 'gap-4');
content = content.replace(/gap-6/g, 'gap-3');
content = content.replace(/gap-5/g, 'gap-3');
content = content.replace(/mb-8/g, 'mb-4');
content = content.replace(/mb-6/g, 'mb-3');
content = content.replace(/my-8/g, 'my-4');
content = content.replace(/my-6/g, 'my-3');
content = content.replace(/py-12/g, 'py-4');
content = content.replace(/py-20/g, 'py-6');
content = content.replace(/rounded-2xl/g, 'rounded-lg');
content = content.replace(/rounded-\[28px\]/g, 'rounded-xl');

content = content.replace(/h-14 w-14/g, 'h-10 w-10');
content = content.replace(/text-4xl/g, 'text-2xl');
content = content.replace(/text-3xl/g, 'text-xl');

fs.writeFileSync(file, content);
console.log('Fixed successfully');
