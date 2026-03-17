tessel-edge
===========

Edge software for the [reelyActive Owl-in-One](https://www.reelyactive.com/products/gateways/#owl-in-one) based on the [Tessel 2](https://tessel.io/) platform.  Forwards [raddecs](https://github.com/reelyactive/raddec/) from a reel module (BLE) and/or from tcpdump (WiFi) to:
- a remote server via UDP and/or webhook (HTTP POST), _and/or_
- an Elasticsearch database, _and/or_
- Google Analytics

For complementary functionality, consider instead:
- [tessel-monitor](https://github.com/reelyactive/tessel-monitor) to monitor Bluetooth Low Energy advertising traffic dynamics
- [tessel-roam](https://github.com/reelyactive/tessel-roam) for mobile geolocated data capture

Consult the following tutorials as step-by-step configuration guides:
- [Configure an Owl-in-One](https://reelyactive.github.io/diy/oio-config/)
- [Create a WLAN of Owl-in-Ones and a laptop](https://reelyactive.github.io/diy/oio-wlan/)


Installation
------------

Clone this repository, browse to its root, then run:

    npm install


Configuration
-------------

All configuration parameters can be found in the file __config.js__.  Update only this file, as required.

| Parameter                 | Description                                     | 
|:--------------------------|:------------------------------------------------|
| RADDEC_TARGETS            | Array of targets for raddec data (see below)    |
| DIRACT_PROXIMITY_TARGETS  | Array of targets for diract-proximity data      |
| DIRACT_DIGEST_TARGETS     | Array of targets for diract-digest data         |
| PG_HOST                   | Hostname or IP address of PostgreSQL database   |
| PG_USER                   | Username for PostgreSQL database                |
| PG_PASSWORD               | Password for PostgreSQL database                |
| PG_DATABASE               | Name of PostgreSQL database                     |
| IS_UDP_BROADCAST          | Set to true if target is UDP broadcast (default: true) |
| LISTEN_TO_REEL            | Enable listener on reel module (default: true)  |
| LISTEN_TO_TCPDUMP         | Enable listener on tcpdump (default: false)     |
| ENABLE_MIXING             | Combine multiple decodings of an individual transmitter into a single raddec (default: true) |
| MIXING_DELAY_MILLISECONDS | Mixing delay of radio decodings (default: 1000) |
| RADDEC_FILTER_PARAMETERS  | (see raddec-filter)                             |
| INCLUDE_TIMESTAMP         | Include the optional timestamp in each raddec (default: true) |
| INCLUDE_PACKETS           | Include the optional packets in each raddec (default: true) |
| IS_DEBUG_MODE             | Set true and `t2 run index.js` for console log  |

Each raddec target in the RADDEC_TARGETS array is an object with the following properties:
- _host_: an IP address or hostname (ex: '192.168.1.10')
- _port_: the target port (default: 50001)
- _protocol_: either 'udp', 'webhook' (HTTP POST), 'postgresql' or 'ua' (Google Analytics)
- _tid_: required only for Google Analytics (ex: 'UA-1234567-8')
- _options_: based on the _protocol_ as follows
    * webhook defaults are { useHttps: false, path: "/raddecs" }
    * ua defaults are { useHttps: true, path: "/collect", page: "/owl-in-one" }

To broadcast UDP to all devices on the subnet, set the _host_ to the corresponding broadcast address (ex: 192.168.1.255) and set IS_UDP_BROADCAST to true.

The DIRACT_PROXIMITY_TARGETS and DIRACT_DIGEST_TARGETS support the 'webhook' and 'elasticsearch' protocols, as described above.


Programming
-----------

Programming the Tessel 2 requires the [t2-cli](https://www.npmjs.com/package/t2-cli) package which can be installed by following [these instructions](http://tessel.github.io/t2-start/).

With the Tessel 2 connected to the programming station via USB, from the root of this repository run:

    t2 push index.js

The code will be pushed to flash memory on the Tessel and will run every time it boots.


Prerequisites
-------------

The __tessel-edge__ software expects the following:
- a reel or reelceiver module connected via UART on Port A
- maximum baud rate of Port A set to at least 230400
- tcpdump installed (only if LISTEN_TO_TCPDUMP is true)


License
-------

MIT License

Copyright (c) 2018-2026 [reelyActive](https://www.reelyactive.com)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR 
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE 
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, 
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN 
THE SOFTWARE.
