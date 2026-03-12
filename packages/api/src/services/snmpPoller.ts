import { logger } from '../utils/logger';

let pollingInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the SNMP polling loop.
 * STUB: Logs that polling would occur but does not actually poll because
 * the `net-snmp` package is not installed.
 */
export function startSnmpPolling(): void {
  if (pollingInterval) {
    logger.warn('SNMP polling is already running');
    return;
  }

  logger.info(
    'SNMP poller started (STUB) - net-snmp package is not installed. ' +
    'Install net-snmp and implement actual polling to enable this feature.'
  );

  // In production this interval would iterate over enabled SnmpDevices,
  // check if each device is due for a poll based on its interval, and
  // perform an SNMP GET for each configured OID, storing results in
  // SnmpPollResult.
  pollingInterval = setInterval(() => {
    logger.debug('SNMP poll tick (stub - no actual polling)');
  }, 60_000);
}

/**
 * Stop the SNMP polling loop.
 */
export function stopSnmpPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    logger.info('SNMP poller stopped');
  }
}
