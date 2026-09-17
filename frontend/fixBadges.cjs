const fs = require('fs');
let file = fs.readFileSync('src/modules/admin/pages/price-management/RentalBookingRequests.jsx', 'utf8');

file = file.replace(/text-\[9px\] font-bold uppercase tracking-wider/g, 'text-xs font-semibold capitalize');
fs.writeFileSync('src/modules/admin/pages/price-management/RentalBookingRequests.jsx', file);
