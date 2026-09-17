export const ADMIN_PERMISSION_GROUPS = [
  {
    title: 'Core Access',
    items: [
      { key: 'dashboard.view', label: 'Dashboard' },
      { key: 'earnings.view', label: 'Admin Earnings' },
      { key: 'chat.view', label: 'Chat' },
      { key: 'promotions.view', label: 'Promotions' },
      { key: 'subadmins.manage', label: 'Subadmins' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { key: 'trips.view', label: 'Trip Requests' },
      { key: 'deliveries.view', label: 'Delivery Requests' },
      { key: 'ongoing.view', label: 'Ongoing Requests' },
      { key: 'drivers.view', label: 'Drivers' },
      { key: 'users.view', label: 'Customers' },
      { key: 'employees.view', label: 'Employees' },
      { key: 'wallet.view', label: 'Wallet' },
      { key: 'owners.view', label: 'Owners' },
      { key: 'support.view', label: 'Support' },
      { key: 'reports.view', label: 'Reports' },
      { key: 'referrals.view', label: 'Referrals' },
    ],
  },
  {
    title: 'Pricing Scope',
    items: [
      { key: 'service_locations.view', label: 'Service Locations' },
      { key: 'zones.view', label: 'Zones' },
      { key: 'airports.view', label: 'Airports' },
      { key: 'service_stores.view', label: 'Service Stores' },
      { key: 'vehicle_types.view', label: 'Vehicle Types' },
      { key: 'set_prices.view', label: 'Set Prices' },
      { key: 'goods_types.view', label: 'Goods Types' },
      { key: 'rental.view', label: 'Rental Modules' },
      { key: 'bus_service.view', label: 'Bus Service' },
      { key: 'pooling.view', label: 'Pooling' },
      { key: 'geofencing.view', label: 'Geofencing' },
    ],
  },
];

export const ALL_ADMIN_PERMISSIONS = ADMIN_PERMISSION_GROUPS.flatMap((group) => group.items.map((item) => item.key));

export const hasAdminPermission = (adminInfo = {}, permission) => {
  const type = String(adminInfo?.admin_type || adminInfo?.role || '').toLowerCase();
  const permissions = Array.isArray(adminInfo?.permissions) ? adminInfo.permissions : [];

  if (type === 'superadmin' || permissions.includes('*')) {
    return true;
  }

  return permissions.includes(permission);
};
