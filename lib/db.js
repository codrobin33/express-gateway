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
  logger.info('Redis is ready');
  logger.info('Attempting to hydrate db with default profiles/scopes...');
  const applicationsSrv = require('./services').user;
  const credentialSrv = require('./services').credential;

  const defaultUser = config.systemConfig.db.defaultUser;
  if (defaultUser) {
    logger.info('Inserting default app.');

    applicationsSrv.insert({
      'username': defaultUser.name,
      'firstname': defaultUser.name,
      'lastname': defaultUser.name
    }).then(result => {
      logger.info('Default app inserted');

      credentialSrv.insertCredential(result.id, 'key-auth', {
        'consumerId': defaultUser.name,
        'type': 'key-auth',
        'keyId': defaultUser.keyId,
        'keySecret': defaultUser.keySecret
      }).then(() => {
        logger.info('Default app credentials inserted');
      }).catch(err => {
        logger.error(err);
      });
    }).catch(err => {
      logger.error(err);
    });
  }

  const scopes = config.systemConfig.db.scopes;
  if (scopes && scopes.length > 0) {
    console.log('Inserting default scopes.');

    var lookupScopes = new Promise(resolve => {
      let scopeExistPromise = [];
      for (let i = 0; i < scopes.length; i++) {
        scopeExistPromise.push(credentialSrv.existsScope(scopes[i]).then(status => {
          return { scope: scopes[i], status };
        }));
      }

      return Promise.all(scopeExistPromise).then(values => {
        resolve(values);
      });
    });

    lookupScopes.then(inserts => {
      const scopesToInsert = inserts.filter(i => {
        return !i.status;
      }).map(i => {
        return i.scope;
      });

      console.log("scope values after filter: ", scopesToInsert);
      if (scopesToInsert.length > 0) {
        credentialSrv.insertScopes(scopesToInsert).then(res => {
          console.log('Default scopes inserted.');
        }).catch(err => {
          logger.error(err);
        });
      } else {
        console.log('No scopes to insert.');
      }
    });
  }
});
db.on('error', err => { logger.error(`Error in Redis: ${err}`); });

module.exports = db;
