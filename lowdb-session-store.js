/*
 * MIT License
 *
 * Copyright (c) 2019 Frank Hellwig
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

const lodash = require('lodash')

module.exports = function (session) {
    const Store = session.Store;

    class SessionStore extends Store {
        constructor(db, options = {}) {
            super(options);
            if (db.constructor.name !== 'Low' && db.constructor.name !== 'LowSync') {
                throw new Error('The first argument must be a Low instance.');
            }

            this.db = new Sessions(db, options.ttl);
            if (!options.disablePurge) {
                setInterval(() => {
                    this.db.purge();
                }, 60000);
            }
        }

        all(callback) {
            callback(null, this.db.all());
        }

        clear(callback) {
            this.db.clear();
            callback(null);
        }

        destroy(sid, callback) {
            this.db.destroy(sid);
            if (callback) {
                callback(null);
            }
        }

        get(sid, callback) {
            callback(null, this.db.get(sid));
        }

        length(callback) {
            callback(null, this.db.length());
        }

        set(sid, session, callback) {
            this.db.set(sid, session);
            callback(null);
        }

        touch(sid, session, callback) {
            this.set(sid, session, callback);
        }
    }

    return SessionStore;
};

class Sessions {
    constructor(db, ttl) {
        this.db = db;
        this.chain = lodash.chain(db.data);
        this.ttl = ttl || 86400;
    }

    get(sid) {
        const obj = this.chain.get('sessions').find({ _id: sid }).cloneDeep().value();
        return obj ? obj.session : null;
    }

    all() {
        return this.chain.get('sessions')
            .cloneDeep()
            .map((obj) => obj.session)
            .value();
    }

    length() {
        return this.chain.get('sessions').size().value();
    }

    set(sid, session) {
        const expires = Date.now() + this.ttl * 1000;
        const obj = { _id: sid, session, expires };
        const found = this.chain.get('sessions').find({ _id: sid });
        if (found.value()) {
            found.assign(obj).value();
            this.db.write();
        } else {
            this.db.data.sessions.push(obj);
            this.db.write();
        }
    }

    destroy(sid) {
        this.chain.get('sessions').remove({ _id: sid }).value();
        this.db.write();
    }

    clear() {
        this.chain.get('sessions').remove().value();
        this.db.write();
    }

    purge() {
        const now = Date.now();
        this.chain.get('sessions').remove((obj) => now > obj.expires).value();
        this.db.write();
    }
}
