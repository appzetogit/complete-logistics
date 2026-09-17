const fs = require('fs');
function fixCards(path) {
  let content = fs.readFileSync(path, 'utf8');
  content = content.replace(/className=\{\`admin-card !p-4 border-none text-white /g, 'className={dmin-card !p-4 border-none ');
  content = content.replace(/p-2 rounded-full bg-white\/50/g, 'p-2 rounded-full bg-black/5');
  content = content.replace(/<h3 className="text-2xl font-black text-white /g, '<h3 className="text-2xl font-black text-inherit ');
  content = content.replace(/text-white\/80/g, 'opacity-80');
  content = content.replace(/bg-gradient-to-br from-blue-500 to-indigo-500/g, 'bg-blue-50 border border-blue-100 text-blue-900');
  fs.writeFileSync(path, content);
}
fixCards('frontend/src/modules/admin/pages/management/Admins.jsx');
fixCards('frontend/src/modules/admin/pages/dashboard/MainDashboard.jsx');
fixCards('frontend/src/modules/admin/pages/dashboard/AdminEarnings.jsx');
console.log('Fixed cards');
