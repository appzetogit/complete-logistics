const fs = require('fs');
const file = 'frontend/src/modules/admin/pages/price-management/ServiceLocation.jsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/bg-yellow-600 text-white rounded-md text-sm font-semibold hover:bg-yellow-700/g, '!bg-[#FFC400] !text-[#0B1220] border-none rounded-md text-sm font-bold hover:brightness-95');
content = content.replace(/bg-yellow-600 text-white rounded-lg text-sm font-semibold hover:bg-yellow-700/g, '!bg-[#FFC400] !text-[#0B1220] border-none rounded-lg text-sm font-bold hover:brightness-95');
content = content.replace(/bg-yellow-600 text-white rounded-xl text-sm font-semibold hover:bg-yellow-700/g, '!bg-[#FFC400] !text-[#0B1220] border-none rounded-xl text-sm font-bold hover:brightness-95');

fs.writeFileSync(file, content);
console.log('Fixed button');
