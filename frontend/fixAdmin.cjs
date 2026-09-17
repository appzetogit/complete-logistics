const fs = require('fs');
let file = fs.readFileSync('src/modules/admin/pages/settings/AdminUserAppManagement.jsx', 'utf8');

file = file.replace(/<h4 className="text-\[13px\] font-semibold text-gray-800">/g, '<div className="text-[15px] font-semibold text-gray-800">');
file = file.replace(/<\/h4>/g, '</div>');

fs.writeFileSync('src/modules/admin/pages/settings/AdminUserAppManagement.jsx', file);
