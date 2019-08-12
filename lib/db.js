const logger = require('./logger').db;
const config = require('./config');
const fs = require('fs');
const redisOptions = config.systemConfig.db && config.systemConfig.db.redis;

// special mode, will emulate all redis commands.
// designed for demo and test scenarious to avoid having real Redis instance
const emulate = process.argv[2] === 'emulate' || redisOptions.emulate;

if (redisOptions.tls) {
  if (redisOptions.tls.keyFile) {
    redisOptions.tls.key = fs.readFileSync(redisOptions.tls.keyFile);
  };

  if (redisOptions.tls.certFile) {
    redisOptions.tls.cert = fs.readFileSync(redisOptions.tls.certFile);
  }

  if (redisOptions.tls.caFile) {
    redisOptions.tls.ca = fs.readFileSync(redisOptions.tls.caFile);
  }
}

const Redis = require(emulate ? 'ioredis-mock' : 'ioredis');
const db = new Redis(redisOptions);

db.on('ready', () => {
  logger.debug('Redis is ready');
  console.log('attempting to hydrate db with default profiles...');
  const applicationsSrv = require('./services').user;
  const credentialSrv = require('./services').credential;

  const defaultUser = config.systemConfig.db.defaultUser;
  if (!defaultUser) {
    console.log('no default found.');
    return;
  }

  applicationsSrv.insert({
    'username': defaultUser.name,
    'firstname': defaultUser.name,
    'lastname': defaultUser.name
  }).then(result => {
    //console.log('result: ', result);
    logger.debug('default app inserted');

    credentialSrv.insertCredential(result.id, 'key-auth', {
      'consumerId': defaultUser.name,
      'type': 'key-auth',
      'keyId': defaultUser.keyId,
      'keySecret': defaultUser.keySecret
    }).then(cred_result => {
      console.log(cred_result);
      logger.debug('default app credentials inserted');
    }).catch(err => {
      logger.error(err);
    });
  }).catch(err => {
    logger.error(err);
  });
});
db.on('error', err => { logger.error(`Error in Redis: ${err}`); });

module.exports = db;
