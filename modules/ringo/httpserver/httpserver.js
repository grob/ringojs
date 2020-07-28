const log = require('ringo/logging').getLogger(module.id);
const {XmlConfiguration} = org.eclipse.jetty.xml;
const {Server, HttpConfiguration, HttpConnectionFactory,
        ServerConnector, SslConnectionFactory,
        SecureRequestCustomizer, ServerConnectionStatistics} = org.eclipse.jetty.server;
const {HandlerCollection, ContextHandlerCollection} = org.eclipse.jetty.server.handler;
const {ConnectionStatistics} = org.eclipse.jetty.io;
const {HttpVersion, HttpCookie} = org.eclipse.jetty.http;
const {DefaultSessionIdManager} = org.eclipse.jetty.server.session;
const {SslContextFactory} = org.eclipse.jetty.util.ssl;

const objects = require("ringo/utils/objects");
const ApplicationContext = require("./context/application");
const StaticContext = require("./context/static");
const fs = require("fs");

const HttpServer = module.exports = function HttpServer(options) {
    if (!(this instanceof HttpServer)) {
        return new HttpServer(options);
    }

    const jetty = new Server();

    let xmlConfig = null;

    Object.defineProperties(this, {
        "jetty": {
            "value": jetty,
            "enumerable": true
        },
        "xmlConfig": {
            "get": function() {
                return xmlConfig;
            },
            "set": function(config) {
                if (!(config instanceof XmlConfiguration)) {
                    throw new Error("Invalid jetty xml configuration");
                }
                xmlConfig = config;
                xmlConfig.configure(jetty);
            },
            "enumerable": true
        },
        "contexts": {
            "value": {},
            "enumerable": true
        }
    });

    if (options !== null && options !== undefined) {
        if (typeof(options) === "string") {
            // path to jetty xml configuration
            this.configure(options);
        } else if (typeof(options) === "object" && options.constructor === Object) {
            jetty.setStopAtShutdown(options.stopAtShutdown !== false);
            jetty.setStopTimeout(options.stopTimeout || 1000);
            jetty.setDumpAfterStart(options.dumpBeforeStart === true);
            jetty.setDumpBeforeStop(options.dumpBeforeStop === true);
        }
    }
    return this;
};

HttpServer.prototype.toString = function() {
    return "[HttpServer]";
};

HttpServer.prototype.configure = function(xmlPath) {
    const xmlResource = getResource(xmlPath);
    if (!xmlResource.exists()) {
        throw Error('Jetty XML configuration "' + xmlResource + '" not found');
    }
    return this.xmlConfig = new XmlConfiguration(xmlResource.inputStream);
};

HttpServer.prototype.createHttpConfig = function(options) {
    options = objects.merge(options || {}, {
        "requestHeaderSize": 8129,
        "outputBufferSize": 32768,
        "responseHeaderSize": 8129,
        "secureScheme": "https"
    });
    const httpConfig = new HttpConfiguration();
    httpConfig.setRequestHeaderSize(options.requestHeaderSize);
    httpConfig.setOutputBufferSize(options.outputBufferSize);
    httpConfig.setResponseHeaderSize(options.responseHeaderSize);
    httpConfig.setSecureScheme(options.secureScheme);
    httpConfig.setSendServerVersion(options.sendServerVersion === true);
    httpConfig.setSendDateHeader(options.sendDateHeader !== false);
    return httpConfig;
};

HttpServer.prototype.createConnector = function(connectionFactory, options) {
    const connector = new ServerConnector(this.jetty, options.acceptors || -1,
            options.selectors || -1, connectionFactory);
    connector.setHost(options.host);
    connector.setPort(options.port);
    connector.setIdleTimeout(options.idleTimeout || 30000);
    connector.setSoLingerTime(options.soLingerTime || -1);
    connector.setAcceptorPriorityDelta(options.acceptorPriorityDelta || 0);
    connector.setAcceptQueueSize(options.acceptQueueSize || 0);
    if (typeof(options.name) === "string") {
        connector.setName(options.name);
    }
    return connector;
};

HttpServer.prototype.createHttpConnector = function(options) {
    options = objects.merge(options || {}, {
        "host": "0.0.0.0",
        "port": 8080
    });
    const httpConfig = this.createHttpConfig(options);
    const connectionFactory = new HttpConnectionFactory(httpConfig);
    return this.createConnector(connectionFactory, options);
};

HttpServer.prototype.createSslContextFactory = function(options) {
    options = objects.merge(options || {}, {
        "verbose": false,
        "includeCipherSuites": [],
        "excludeCipherSuites": [
            "^SSL_.*",
            "^TLS_DHE_.*",
            "TLS_ECDHE_RSA_WITH_3DES_EDE_CBC_SHA",
            "TLS_ECDH_RSA_WITH_3DES_EDE_CBC_SHA"
        ],
        "includeProtocols": ["TLSv1.2"]
    });
    const sslContextFactory = new SslContextFactory();
    sslContextFactory.setKeyStorePath(options.keyStore);
    sslContextFactory.setKeyStoreType(options.keyStoreType || "JKS");
    sslContextFactory.setKeyStorePassword(options.keyStorePassword);
    sslContextFactory.setKeyManagerPassword(options.keyManagerPassword);
    sslContextFactory.setTrustStorePath(options.trustStore || options.keyStore);
    sslContextFactory.setTrustStorePassword(options.trustStorePassword ||
            options.keyStorePassword);
    sslContextFactory.setIncludeCipherSuites(options.includeCipherSuites);
    sslContextFactory.setExcludeCipherSuites(options.excludeCipherSuites);
    sslContextFactory.setIncludeProtocols(options.includeProtocols);
    sslContextFactory.setExcludeProtocols(options.excludeProtocols);
    sslContextFactory.setRenegotiationAllowed(options.allowRenegotiation === true);
    if (options.verbose === true) {
        log.info(sslContextFactory.dump());
    }
    return sslContextFactory;
};

HttpServer.prototype.createHttpsConnector = function(options) {
    options = objects.merge(options || {}, {
        "host": "0.0.0.0",
        "port": 8443,
        "sniHostCheck": true,
        "stsMaxAgeSeconds": -1,
        "stsIncludeSubdomains": false
    });
    const sslContextFactory = this.createSslContextFactory(options);
    const sslConnectionFactory = new SslConnectionFactory(sslContextFactory,
            HttpVersion.HTTP_1_1.toString());
    const httpsConfig = this.createHttpConfig(options);
    const customizer = new SecureRequestCustomizer();
    customizer.setSniHostCheck(options.sniHostCheck === true);
    if (!isNaN(options.stsMaxAgeSeconds)) {
        customizer.setStsMaxAge(options.stsMaxAgeSeconds);
    }
    customizer.setStsIncludeSubDomains(options.stsIncludeSubdomains === true);
    httpsConfig.addCustomizer(customizer);
    const httpConnectionFactory = new HttpConnectionFactory(httpsConfig);
    return this.createConnector([sslConnectionFactory, httpConnectionFactory], options);
};

HttpServer.prototype.createHttpListener = function(options) {
    const connector = this.createHttpConnector(options);
    this.jetty.addConnector(connector);
    return connector;
};

HttpServer.prototype.createHttpsListener = function(options) {
    const connector = this.createHttpsConnector(options);
    this.jetty.addConnector(connector);
    return connector;
};

HttpServer.prototype.getHandlerCollection = function() {
    let handlerCollection = this.jetty.getHandler();
    if (handlerCollection === null) {
        handlerCollection = new HandlerCollection();
        this.jetty.setHandler(handlerCollection);
    }
    return handlerCollection;
};

HttpServer.prototype.getContextHandlerCollection = function() {
    const handlerCollection = this.getHandlerCollection();
    let contextHandlerCollection =
            handlerCollection.getChildHandlerByClass(ContextHandlerCollection);
    if (contextHandlerCollection === null) {
        contextHandlerCollection = new ContextHandlerCollection();
        handlerCollection.addHandler(contextHandlerCollection);
    }
    return contextHandlerCollection;
};

HttpServer.prototype.addContext = function(context) {
    this.contexts[context.getKey()] = context;
    if (this.jetty.isRunning()) {
        context.contextHandler.start();
    }
    return context;
};

HttpServer.prototype.enableSessions = function(options) {
    options || (options = {});

    // if random is null, jetty will fall back to a SecureRandom in its initRandom()
    const sessionIdManager = new DefaultSessionIdManager(this.jetty, options.random || null);
    sessionIdManager.setWorkerName(options.name || "node1");
    this.jetty.setSessionIdManager(sessionIdManager);
    return sessionIdManager;
};

HttpServer.prototype.serveApplication = function(mountpoint, app, options) {
    if (typeof(mountpoint) !== "string") {
        throw new Error("Missing mountpoint argument");
    }
    options || (options = {});
    if (typeof(options.sameSiteCookies) === "string") {
        options.sameSiteCookies = options.sameSiteCookies.toUpperCase();
        const allowedValues = Array.from(HttpCookie.SameSite.values()).map(value => value.toString());
        if (!allowedValues.includes(options.sameSiteCookies)) {
            throw new Error("Invalid sameSiteCookies option, must be one of " + allowedValues.join(", "));
        }
    }
    options = {
        "security": options.security !== false,
        "sessions": options.sessions !== false,
        "sessionsMaxInactiveInterval": options.sessionsMaxInactiveInterval || null,
        "cookieName": options.cookieName || null,
        "cookieDomain": options.cookieDomain || null,
        "cookiePath": options.cookiePath || null,
        "cookieMaxAge": options.cookieMaxAge || -1,
        "httpOnlyCookies": options.httpOnlyCookies !== false,
        "secureCookies": options.secureCookies === true,
        "sameSiteCookies": options.sameSiteCookies || null,
        "statistics": options.statistics === true,
        "virtualHosts": options.virtualHosts
    };
    const parentContainer = this.getContextHandlerCollection();
    const context = new ApplicationContext(parentContainer, mountpoint, options);
    context.serve(app);
    return this.addContext(context);
};

HttpServer.prototype.serveStatic = function(mountpoint, directory, options) {
    if (typeof(mountpoint) !== "string") {
        throw new Error("Missing mountpoint argument");
    }
    if (typeof(directory) !== "string") {
        throw new Error("Missing directory argument");
    } else if (!fs.exists(directory) || !fs.isDirectory(directory)) {
        throw new Error("Directory '" + directory + "' doesn't exist or is not a directory");
    }
    options || (options = {});
    const initParameters = {
        "acceptRanges": options.acceptRanges === true,
        "dirAllowed": options.allowDirectoryListing === true,
        "gzip": options.gzip === true,
        "stylesheet": options.stylesheet || null,
        "etags": options.etags !== false,
        "maxCacheSize": options.maxCacheSize || 0,
        "maxCachedFileSize": options.maxCachedFileSize || 0,
        "maxCachedFiles": options.maxCachedFiles || 0,
        "cacheControl": options.cacheControl || null,
        "otherGzipFileExtensions": options.gzipExtensions || null
    };
    const parentContainer = this.getContextHandlerCollection();
    const context = new StaticContext(parentContainer, mountpoint, {
            "security": options.security === true,
            "sessions": options.sessions === true,
            "virtualHosts": options.virtualHosts
        });
    context.serve(directory, initParameters);
    return this.addContext(context);
};

HttpServer.prototype.enableConnectionStatistics = function() {
    ServerConnectionStatistics.addToAllConnectors(this.jetty);
};

HttpServer.prototype.getConnectionStatistics = function() {
    let connectors = this.jetty.getConnectors();
    return connectors.map(function(connector) {
        return {
            "name": connector.getName(),
            "host": connector.getHost(),
            "port": connector.getPort(),
            "statistics": connector.getBean(ConnectionStatistics)
        }
    });
};

HttpServer.prototype.start = function() {
    this.jetty.start();
    this.jetty.getConnectors().forEach(function(connector) {
        log.info("Server on {}:{} started", connector.getHost(), connector.getPort());
    });
};

HttpServer.prototype.stop = function() {
    return this.jetty.stop();
};

HttpServer.prototype.destroy = function() {
    return this.jetty.destroy();
};

HttpServer.prototype.isRunning = function() {
    return this.jetty.isRunning();
};
