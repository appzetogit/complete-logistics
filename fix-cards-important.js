const fs = require('fs');

function fixCards(path) {
    let content = fs.readFileSync(path, 'utf8');
    
    // Add ! to bg- colors in cardBg strings
    content = content.replace(/cardBg:\s*"bg-([a-z]+-[0-9]+)"/g, 'cardBg: "!bg-"');
    
    // Remove bg-opacity-80
    content = content.replace(/bg-opacity-80 /g, '');
    
    // Ensure text is explicitly !text-white so it overrides adminTheme.css if needed
    content = content.replace(/text-white/g, '!text-white');
    
    fs.writeFileSync(path, content);
}

fixCards('frontend/src/modules/admin/pages/management/Admins.jsx');
fixCards('frontend/src/modules/admin/pages/dashboard/MainDashboard.jsx');
fixCards('frontend/src/modules/admin/pages/dashboard/AdminEarnings.jsx');

console.log('Fixed cards!');
