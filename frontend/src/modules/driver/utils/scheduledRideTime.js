export const getScheduledRideCountdown = (value, nowTimestamp = Date.now()) => {
  if (!value) {
    return 'Schedule pending';
  }

  const target = new Date(value).getTime();
  if (!Number.isFinite(target)) {
    return 'Schedule pending';
  }

  const remainingMs = target - nowTimestamp;
  if (remainingMs <= 0) {
    return 'Dispatching now';
  }

  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `Starts in ${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
  }

  if (hours > 0) {
    return `Starts in ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  }

  return `Starts in ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
};
