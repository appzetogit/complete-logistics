const fs = require('fs');

function applyVibrant(path, replacements) {
    let content = fs.readFileSync(path, 'utf8');
    
    // First, fix the card classes back to text-white
    content = content.replace(/className=\{\`admin-card !p-4 border-none hover/g, 'className={dmin-card !p-4 border-none text-white hover');
    
    // Change bg-black/5 back to bg-white/20 for icons
    content = content.replace(/bg-black\/5/g, 'bg-white/20');
    
    // Admins specific fixes
    content = content.replace(/text-inherit/g, 'text-white');
    
    // Replace the specific light backgrounds with vibrant ones
    for (const [light, vibrant] of Object.entries(replacements)) {
        content = content.replace(new RegExp(light, 'g'), vibrant);
    }
    
    fs.writeFileSync(path, content);
}

const adminsReplacements = {
    'bg-indigo-50 border border-indigo-100 text-indigo-900': 'bg-violet-500/90',
    'bg-emerald-50 border border-emerald-100 text-emerald-900': 'bg-emerald-500/90',
    'bg-blue-50 border border-blue-100 text-blue-900': 'bg-blue-500/90',
    'bg-fuchsia-50 border border-fuchsia-100 text-fuchsia-900': 'bg-fuchsia-500/90',
    'bg-amber-50 border border-amber-100 text-amber-900': 'bg-orange-500/90',
    'bg-rose-50 border border-rose-100 text-rose-900': 'bg-rose-500/90'
};

const dashboardReplacements = {
    'bg-indigo-50 border border-indigo-100 text-indigo-900': 'bg-violet-500/90',
    'bg-blue-50 border border-blue-100 text-blue-900': 'bg-sky-500/90',
    'bg-emerald-50 border border-emerald-100 text-emerald-900': 'bg-emerald-500/90',
    'bg-rose-50 border border-rose-100 text-rose-900': 'bg-rose-500/90',
    'bg-amber-50 border border-amber-100 text-amber-900': 'bg-orange-500/90',
    'bg-sky-50 border border-sky-100 text-sky-900': 'bg-blue-500/90',
    'bg-violet-50 border border-violet-100 text-violet-900': 'bg-violet-500/90',
    'bg-teal-50 border border-teal-100 text-teal-900': 'bg-teal-500/90',
    'bg-red-50 border border-red-100 text-red-900': 'bg-red-500/90'
};

const earningsReplacements = {
    'bg-amber-50 border border-amber-100 text-amber-900': 'bg-orange-500/90',
    'bg-blue-50 border border-blue-100 text-blue-900': 'bg-blue-500/90',
    'bg-emerald-50 border border-emerald-100 text-emerald-900': 'bg-emerald-500/90',
    'bg-indigo-50 border border-indigo-100 text-indigo-900': 'bg-violet-500/90',
    'bg-fuchsia-50 border border-fuchsia-100 text-fuchsia-900': 'bg-fuchsia-500/90',
    'bg-slate-50 border border-slate-100 text-slate-900': 'bg-slate-600/90',
    'bg-teal-50 border border-teal-100 text-teal-900': 'bg-teal-500/90',
    'bg-orange-50 border border-orange-100 text-orange-900': 'bg-orange-500/90',
    'bg-rose-50 border border-rose-100 text-rose-900': 'bg-rose-500/90',
    'bg-sky-50 border border-sky-100 text-sky-900': 'bg-sky-500/90'
};

applyVibrant('frontend/src/modules/admin/pages/management/Admins.jsx', adminsReplacements);
applyVibrant('frontend/src/modules/admin/pages/dashboard/MainDashboard.jsx', dashboardReplacements);
applyVibrant('frontend/src/modules/admin/pages/dashboard/AdminEarnings.jsx', earningsReplacements);
console.log('Fixed cards back to vibrant with 90% opacity!');
