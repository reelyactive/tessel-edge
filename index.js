/*
 * Copyright reelyActive 2018-2026
 * We believe in an open Internet of Things
 */

'use strict';

const tessel = require('tessel');
const dgram = require('dgram');
const http = require('http');
const https = require('https');
const dns = require('dns');
const querystring = require('querystring');
const pg = require('pg');
const Barnowl = require('barnowl');
const BarnowlReel = require('barnowl-reel');
const BarnowlTcpdump = require('barnowl-tcpdump');
const DirActDigester = require('diract-digester');
const Raddec = require('raddec');
const RaddecFilter = require('raddec-filter');
const config = require('./config');

// Load the configuration parameters
const raddecTargets = config.raddecTargets;
const diractProximityTargets = config.diractProximityTargets;
const diractDigestTargets = config.diractDigestTargets;
const barnowlOptions = {
    enableMixing: config.enableMixing,
    mixingDelayMilliseconds: config.mixingDelayMilliseconds
};
const raddecOptions = {
    includeTimestamp: config.includeTimestamp,
    includePackets: config.includePackets
};
const raddecFilterParameters = config.raddecFilterParameters;
const usePostgres = (config.pgHost !== null);
const useDigester = (config.diractProximityTargets.length > 0) ||
                    (config.diractDigestTargets.length > 0);
let digesterOptions = {};
if(config.diractProximityTargets.length > 0) {
  digesterOptions.handleDirActProximity = handleDirActProximity;
};
if(config.diractDigestTargets.length > 0) {
  digesterOptions.handleDirActDigest = handleDirActDigest;
};
const watchdogIntervalMilliseconds = config.watchdogIntervalMilliseconds;
const watchdogLenienceMilliseconds = config.watchdogLenienceMilliseconds;
const isDebugMode = config.isDebugMode;

// Constants
const REEL_BAUD_RATE = 230400;
const DEFAULT_RADDEC_PATH = '/raddecs';
const DEFAULT_UA_PATH = '/collect';
const DEFAULT_UA_HOST = 'www.google-analytics.com';
const DEFAULT_UA_PAGE = '/owl-in-one';
const INVALID_DNS_UPDATE_MILLISECONDS = 2000;
const STANDARD_DNS_UPDATE_MILLISECONDS = 60000;
const REEL_DECODING_OPTIONS = {
    maxReelLength: 1,
    minPacketLength: 8,
    maxPacketLength: 39
};


// Enable watchdog
if(config.enableWatchdog) {
  iterateWatchdog(Date.now());
}

// Enable scheduled reboot
if(Number.isFinite(config.scheduledRebootMilliseconds)) {
  setTimeout(() => { process.exit(1); }, config.scheduledRebootMilliseconds);
}

// Update DNS
updateDNS();

// Create a UDP client
let client = dgram.createSocket('udp4');
client.on('listening', () => {
  client.setBroadcast(config.isUdpBroadcast);
});

// Create HTTP and HTTPS agents for webhooks
let httpAgent = new http.Agent({ keepAlive: true });
let httpsAgent = new https.Agent({ keepAlive: true });

// Create PostgreSQL client pool
let pgPool;
if(usePostgres) {
  pgPool = new pg.Pool({
      user: config.pgUser,
      password: config.pgPassword,
      host: config.pgHost,
      database: config.pgDatabase,
      max: config.pgMaxConnections,
      min: config.pgMinConnections,
      connectionTimeoutMillis: config.pgConnectionTimeoutMilliseconds
  });
  pgPool.on('error', (error, client) => { if(error) { handleError(error); } });
  pgPool.connect((error, client, release) => {
    if(error) { handleError(error); }
    release();
  });
}

// Create raddec filter
let filter = new RaddecFilter(raddecFilterParameters);

// Create diract digester
let digester = new DirActDigester(digesterOptions);

// Create barnowl instance with the configuration options
let barnowl = new Barnowl(barnowlOptions);

// Have barnowl listen for reel data, if selected in configuration
if(config.listenToReel) {
  let uart = new tessel.port['A'].UART({ baudrate: REEL_BAUD_RATE });
  barnowl.addListener(BarnowlReel, {}, BarnowlReel.EventListener,
                      { path: uart, decodingOptions: REEL_DECODING_OPTIONS });
}

// Have barnowl listen for tcpdump data, if selected in configuration
if(config.listenToTcpdump) {
  barnowl.addListener(BarnowlTcpdump, {}, BarnowlTcpdump.SpawnListener, {});
}

// Forward the raddec to each target while pulsing the green LED
barnowl.on('raddec', (raddec) => {
  tessel.led[2].on();
  if(filter.isPassing(raddec)) {
    raddecTargets.forEach((target) => {
      forward(raddec, target);
    });
    if(useDigester) {
      digester.handleRaddec(raddec);
    }
  }
  tessel.led[2].off();
});

// Blue LED continuously toggles to indicate program is running
setInterval(() => { tessel.led[3].toggle(); }, 500);


/**
 * Forward the given raddec to the given target, observing the target protocol.
 * @param {Raddec} raddec The outbound raddec.
 * @param {Object} target The target host, port and protocol.
 */
function forward(raddec, target) {
  switch(target.protocol) {
    case 'udp':
      if(target.isValidAddress) {
        let raddecHex = raddec.encodeAsHexString(raddecOptions);
        client.send(new Buffer(raddecHex, 'hex'), target.port, target.address,
                    function(err) { });
      }
      break;
    case 'webhook':
      target.options = target.options || {};
      target.options.path = target.options.path || DEFAULT_RADDEC_PATH;
      post(raddec, target);
      break;
    case 'postgresql':
      pgInsertRaddec(raddec);
      break;
    case 'ua':
      target.host = target.host || DEFAULT_UA_HOST;
      target.port = target.port || 443;
      target.options = target.options || {};
      target.options.path = target.options.path || DEFAULT_UA_PATH;
      if(!(target.options.useHttps === false)) {
        target.options.useHttps = true;
      }
      let data = {
          v: '1',
          tid: target.tid,
          cid: raddec.transmitterId + '/' + raddec.transmitterIdType,
          t: 'pageview',
          dp: target.options.page || DEFAULT_UA_PAGE
      };
      post(data, target, true);
      break;
  }
}


/**
 * HTTP POST the given JSON data to the given target.
 * @param {Object} data The data to POST.
 * @param {Object} target The target host, port and protocol.
 * @param {boolean} toQueryString Convert the data to query string?
 */
function post(data, target, toQueryString) {
  target.options = target.options || {};
  let dataString;
  let headers;

  if(toQueryString) {
    dataString = querystring.encode(data);
    headers = { "Content-Length": dataString.length };
  }
  else {
    dataString = JSON.stringify(data);
    headers = {
        "Content-Type": "application/json",
        "Content-Length": dataString.length
    };
  }

  let options = {
      hostname: target.host,
      port: target.port,
      path: target.options.path || '/',
      method: 'POST',
      headers: headers
  };
  let req;
  if(target.options.useHttps) {
    options.agent = httpsAgent;
    req = https.request(options, (res) => { });
  }
  else {
    options.agent = httpAgent;
    req = http.request(options, (res) => { });
  }
  req.on('error', handleError);
  req.write(dataString);
  req.end();
}


/**
 * Insert a raddec into the remote PostgreSQL database.
 * @param {Raddec} raddec The raddec to insert.
 */
function pgInsertRaddec(raddec) {
  if(pgPool.waitingCount >= config.pgMaxWaiting) {
    return;
  }

  let flatRaddec = raddec.toFlattened(raddecOptions);
  let text = 'INSERT INTO raddec (transmitterSignature, timestamp, raddec) ' +
             'VALUES ($1, $2, $3)';
  let values = [ raddec.signature, new Date(raddec.initialTime),
                 JSON.stringify(flatRaddec) ];
  pgPool.query(text, values, (err, res) => { if(err) { handleError(err); } });
}


/**
 * Handle a DirAct proximity packet by forwarding to all targets.
 * @param {Object} proximity The DirAct proximity data.
 */
function handleDirActProximity(proximity) {
  diractProximityTargets.forEach((target) => {
    switch(target.protocol) {
      case 'webhook':
        post(proximity, target);
        break;
    }
  });
}


/**
 * Handle a DirAct digest packet by forwarding to all targets.
 * @param {Object} digest The DirAct digest data.
 */
function handleDirActDigest(digest) {
  diractDigestTargets.forEach((target) => {
    switch(target.protocol) {
      case 'webhook':
        post(digest, target);
        break;
    }
  });
}


/**
 * Perform a DNS lookup on all hostnames where the UDP protocol is used,
 * and self-set a timeout to repeat the process again.
 */
function updateDNS() {
  let nextUpdateMilliseconds = STANDARD_DNS_UPDATE_MILLISECONDS;

  // If there are invalid UDP addresses, shorten the update period
  raddecTargets.forEach((target) => {
    if((target.protocol === 'udp') && !target.isValidAddress) {
      nextUpdateMilliseconds = INVALID_DNS_UPDATE_MILLISECONDS;
    }
  });

  // Perform a DNS lookup on each UDP target
  raddecTargets.forEach((target) => {
    if(target.protocol === 'udp') {
      dns.lookup(target.host, {}, (err, address, family) => {
        if(err) {
          handleError(err);
          target.isValidAddress = false;
        }
        else {
          target.address = address;
          target.isValidAddress = true;
        }
      });
    }
  });

  // Schedule the next DNS update
  setTimeout(updateDNS, nextUpdateMilliseconds);
}


/**
 * Self-iterating function which checks if it executes at the expected time
 * plus a given amount of lenience.  If execution occurs beyond this time
 * window, the process commits suicide with the expectation that it will be
 * restarted by the OS.  If all is well, it schedules the next execution.
 * @param {Number} previousTimestamp The timestamp at which this last executed.
 */
function iterateWatchdog(previousTimestamp) {
  let currentTimestamp = Date.now();
  let expectedTimestamp = previousTimestamp + watchdogIntervalMilliseconds;

  if((currentTimestamp - expectedTimestamp) > watchdogLenienceMilliseconds) {
    if(isDebugMode) {
      let lateness = currentTimestamp - (expectedTimestamp +
                                         watchdogLenienceMilliseconds);
      console.log('Watchdog ran ' + lateness + 'ms too late.  Exiting process');
    }
    process.exit(1);
  }

  setTimeout(iterateWatchdog, watchdogIntervalMilliseconds, currentTimestamp);
}


/**
 * Handle the given error by blinking the red LED and, if debug mode is enabled,
 * print the error to the console.
 * @param {Object} err The error to handle.
 */
function handleError(err) {
  tessel.led[0].on();
  if(isDebugMode) {
    console.log(err);
  }
  tessel.led[0].off();
}
