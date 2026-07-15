/*
 * Copyright reelyActive 2018-2026
 * We believe in an open Internet of Things
 */


const Raddec = require('raddec');


// Begin configurable parameters
// -----------------------------

const RADDEC_TARGETS = [
    { protocol: "udp", host: "192.168.1.255", port: "50001" }
];
const DIRACT_PROXIMITY_TARGETS = [
];
const DIRACT_DIGEST_TARGETS = [
];
const PG_HOST = null;            // Example: '12.34.56.78'
const PG_USER = 'reelyactive';
const PG_PASSWORD = 'paretoanywhere';
const PG_DATABASE = 'pareto_anywhere';
const PG_MAX_CONNECTIONS = 3;
const PG_MIN_CONNECTIONS = 1;
const PG_CONNECTION_TIMEOUT_MILLISECONDS = 15000;
const PG_MAX_WAITING = 100;
const IS_UDP_BROADCAST = true;
const LISTEN_TO_REEL = true;
const LISTEN_TO_TCPDUMP = false;
const ENABLE_MIXING = true;
const MIXING_DELAY_MILLISECONDS = 1000;
const RADDEC_FILTER_PARAMETERS = {
    acceptedReceiverIdTypes: [ Raddec.identifiers.TYPE_EUI64,
                               Raddec.identifiers.TYPE_EUI48 ],
    minRSSI: -99
};
const INCLUDE_TIMESTAMP = false;
const INCLUDE_PACKETS = true;
const ENABLE_WATCHDOG = true;
const WATCHDOG_INTERVAL_MILLISECONDS = 5000;
const WATCHDOG_LENIENCE_MILLISECONDS = 1000;
const SCHEDULED_REBOOT_MILLISECONDS = null;
const IS_DEBUG_MODE = false;

// ---------------------------
// End configurable parameters


module.exports.raddecTargets = RADDEC_TARGETS;
module.exports.diractProximityTargets = DIRACT_PROXIMITY_TARGETS;
module.exports.diractDigestTargets = DIRACT_DIGEST_TARGETS;
module.exports.pgHost = PG_HOST;
module.exports.pgUser = PG_USER;
module.exports.pgPassword = PG_PASSWORD;
module.exports.pgDatabase = PG_DATABASE;
module.exports.pgMaxConnections = PG_MAX_CONNECTIONS;
module.exports.pgMinConnections = PG_MIN_CONNECTIONS;
module.exports.pgConnectionTimeoutMilliseconds =
                                            PG_CONNECTION_TIMEOUT_MILLISECONDS;
module.exports.pgMaxWaiting = PG_MAX_WAITING;
module.exports.isUdpBroadcast = IS_UDP_BROADCAST;
module.exports.listenToReel = LISTEN_TO_REEL;
module.exports.listenToTcpdump = LISTEN_TO_TCPDUMP;
module.exports.enableMixing = ENABLE_MIXING;
module.exports.mixingDelayMilliseconds = MIXING_DELAY_MILLISECONDS;
module.exports.raddecFilterParameters = RADDEC_FILTER_PARAMETERS;
module.exports.includeTimestamp = INCLUDE_TIMESTAMP;
module.exports.includePackets = INCLUDE_PACKETS;
module.exports.enableWatchdog = ENABLE_WATCHDOG;
module.exports.watchdogIntervalMilliseconds = WATCHDOG_INTERVAL_MILLISECONDS;
module.exports.watchdogLenienceMilliseconds = WATCHDOG_LENIENCE_MILLISECONDS;
module.exports.scheduledRebootMilliseconds = SCHEDULED_REBOOT_MILLISECONDS;
module.exports.isDebugMode = IS_DEBUG_MODE;
