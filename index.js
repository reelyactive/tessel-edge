/*
 * Copyright reelyActive 2018-2020
 * We believe in an open Internet of Things
 */

'use strict';

const tessel = require('tessel');
const dgram = require('dgram');
const http = require('http');
const https = require('https');
const dns = require('dns');
const Barnowl = require('barnowl');
const BarnowlReel = require('barnowl-reel');
const BarnowlTcpdump = require('barnowl-tcpdump');
const DirActDigester = require('diract-digester');
const Raddec = require('raddec');
const { Client } = require('@elastic/elasticsearch');
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
const useElasticsearch = (config.esNode !== null);
const useDigester = (config.diractProximityTargets.length > 0) ||
                    (config.diractDigestTargets.length > 0);
let digesterOptions = {};
if(config.diractProximityTargets.length > 0) {
  digesterOptions.handleDirActProximity = handleDirActProximity;
};
if(config.diractDigestTargets.length > 0) {
  digesterOptions.handleDirActDigest = handleDirActDigest;
};
const isDebugMode = config.isDebugMode;

// Constants
const REEL_BAUD_RATE = 230400;
const DEFAULT_RADDEC_PATH = '/raddecs';
const INVALID_DNS_UPDATE_MILLISECONDS = 2000;
const STANDARD_DNS_UPDATE_MILLISECONDS = 60000;
const REEL_DECODING_OPTIONS = {
    maxReelLength: 1,
    minPacketLength: 8,
    maxPacketLength: 39
};
const ES_RADDEC_INDEX = 'raddec';
const ES_DIRACT_PROXIMITY_INDEX = 'diract-proximity';
const ES_DIRACT_DIGEST_INDEX = 'diract-digest';
const ES_MAPPING_TYPE = '_doc';

// Update DNS
updateDNS();

// Create a UDP client
let client = dgram.createSocket('udp4');
client.on('listening', function() {
  client.setBroadcast(config.isUdpBroadcast);
});

// Create HTTP and HTTPS agents for webhooks
let httpAgent = new http.Agent({ keepAlive: true });
let httpsAgent = new https.Agent({ keepAlive: true });

// Create Elasticsearch client
let esClient;
if(useElasticsearch) {
  esClient = new Client({ node: config.esNode });
}

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
barnowl.on('raddec', function(raddec) {
  tessel.led[2].on();
  raddecTargets.forEach(function(target) {
    forward(raddec, target);
  });
  if(useDigester) {
    digester.handleRaddec(raddec);
  }
  tessel.led[2].off();
});

// Blue LED continuously toggles to indicate program is running
setInterval(function() { tessel.led[3].toggle(); }, 500);


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
    case 'elasticsearch':
      let id = raddec.timestamp + '-' + raddec.transmitterId + '-' +
               raddec.transmitterIdType;
      let esRaddec = raddec.toFlattened(raddecOptions);
      esRaddec.timestamp = new Date(esRaddec.timestamp).toISOString();
      let params = {
          index: ES_RADDEC_INDEX,
          type: ES_MAPPING_TYPE,
          id: id,
          body: esRaddec
      };
      esCreate(params);
      break;
  }
}


/**
 * HTTP POST the given JSON data to the given target.
 * @param {Object} data The data to POST.
 * @param {Object} target The target host, port and protocol.
 */
function post(data, target) {
  target.options = target.options || {};
  let dataString = JSON.stringify(data);
  let options = {
      hostname: target.host,
      port: target.port,
      path: target.options.path || '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': dataString.length
      }
  };
  let req;
  if(target.options.useHttps) {
    options.agent = httpsAgent;
    req = https.request(options, function(res) { });
  }
  else {
    options.agent = httpAgent;
    req = http.request(options, function(res) { });
  }
  req.on('error', handleError);
  req.write(dataString);
  req.end();
}


/**
 * Create an entry in Elasticsearch.
 * @param {Object} params The parameters.
 */
function esCreate(params) {
  if(useElasticsearch) {
    esClient.create(params, {}, function(err, result) {
      if(err) {
        handleError(err);
      }
    });
  }
}


/**
 * Handle a DirAct proximity packet by forwarding to all targets.
 * @param {Object} proximity The DirAct proximity data.
 */
function handleDirActProximity(proximity) {
  diractProximityTargets.forEach(function(target) {
    switch(target.protocol) {
      case 'webhook':
        post(proximity, target);
        break;
      case 'elasticsearch':
        let id = proximity.timestamp + '-' + proximity.instanceId;
        let timestamp = new Date(proximity.timestamp).toISOString();
        let esProximity = { timestamp: timestamp };
        Object.assign(esProximity, proximity);
        let params = {
            index: ES_DIRACT_PROXIMITY_INDEX,
            type: ES_MAPPING_TYPE,
            id: id,
            body: esProximity
        };
        esCreate(params);
        break;
    }
  });
}


/**
 * Handle a DirAct digest packet by forwarding to all targets.
 * @param {Object} digest The DirAct digest data.
 */
function handleDirActDigest(digest) {
  diractDigestTargets.forEach(function(target) {
    switch(target.protocol) {
      case 'webhook':
        post(digest, target);
        break;
      case 'elasticsearch':
        let id = digest.timestamp + '-' + digest.instanceId;
        let timestamp = new Date(digest.timestamp).toISOString();
        let esDigest = { timestamp: timestamp };
        Object.assign(esDigest, digest);
        let params = {
            index: ES_DIRACT_DIGEST_INDEX,
            type: ES_MAPPING_TYPE,
            id: id,
            body: esDigest
        };
        esCreate(params);
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
  raddecTargets.forEach(function(target) {
    if((target.protocol === 'udp') && !target.isValidAddress) {
      nextUpdateMilliseconds = INVALID_DNS_UPDATE_MILLISECONDS;
    }
  });

  // Perform a DNS lookup on each UDP target
  raddecTargets.forEach(function(target) {
    if(target.protocol === 'udp') {
      dns.lookup(target.host, {}, function(err, address, family) {
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
