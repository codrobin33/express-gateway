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
        logger.info('[default_user] found default app.');

        applicationsSrv.insert({
            'username': defaultUser.name,
            'firstname': defaultUser.name,
            'lastname': defaultUser.name
        }).then(result => {
            logger.info('[default_user] default app inserted');

            credentialSrv.insertCredential(result.id, 'key-auth', {
                'consumerId': defaultUser.name,
                'type': 'key-auth',
                'keyId': defaultUser.keyId,
                'keySecret': defaultUser.keySecret
            }).then(() => {
                logger.info('[default_user] default app credentials inserted');
            }).catch(err => {
                logger.error(err);
            });
        }).catch(err => {
            logger.error(err);
        });
    }

    const users = config.systemConfig.db.users;
    if (users && users.length > 0) {
        logger.info(`[users] found users to insert: ${users.length}.`);

        for (let i = 0; i < users.length; i++) {
            logger.info(`[users] ${i}: inserting user: ${users[i].name}`);
            applicationsSrv.insert({
                'username': users[i].name,
                'firstname': users[i].name,
                'lastname': users[i].name
            }).then(result => {
                logger.info(`[users] ${i}: ${users[i].name} user inserted`);

                credentialSrv.insertCredential(result.id, 'key-auth', {
                    'consumerId': users[i].name,
                    'type': 'key-auth',
                    'keyId': users[i].keyId,
                    'keySecret': users[i].keySecret
                }).then(() => {
                    logger.info(`[users] ${i}: ${users[i].name} credentials inserted`);
                }).catch(err => {
                    logger.error(err);
                });
            }).catch(err => {
                logger.error(err);
            });
        }
    }

    const scopes = config.systemConfig.db.scopes;
    if (scopes && scopes.length > 0) {
        logger.info(`[scopes] found default scopes: ${scopes.length}.`);

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

            logger.info(`[scopes] scope values after filter: ${scopesToInsert}`);
            if (scopesToInsert.length > 0) {
                credentialSrv.insertScopes(scopesToInsert).then(res => {
                    logger.info('[scopes] default scopes inserted successfully.');
                }).catch(err => {
                    logger.error(err);
                });
            } else {
                logger.info('[scopes] no scopes to insert.');
            }
        });
    }
});
db.on('error', err => { logger.error(`Error in Redis: ${err}`); });

module.exports = db;
