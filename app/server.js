const express = require('express');
const os = require('os');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

const METRICS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';
const metricDefinitions = new Map();
const counterStore = new Map();
const gaugeStore = new Map();
const histogramStore = new Map();

const normaliseLabels = (labels = {}) => {
  const keys = Object.keys(labels).sort();
  const normalised = {};
  for (const key of keys) {
    normalised[key] = labels[key];
  }
  return normalised;
};

const labelKey = (labels = {}) => {
  const keys = Object.keys(labels).sort();
  return keys.map((key) => `${key}:${labels[key]}`).join('|');
};

const formatLabels = (labels = {}) => {
  const keys = Object.keys(labels);
  if (!keys.length) {
    return '';
  }
  const parts = keys
    .sort()
    .map((key) => `${key}="${String(labels[key]).replace(/"/g, '\\"')}"`);
  return `{${parts.join(',')}}`;
};

const getStore = (storeMap, name) => {
  if (!storeMap.has(name)) {
    storeMap.set(name, new Map());
  }
  return storeMap.get(name);
};

const defineMetric = (name, type, help, options = {}) => {
  if (!metricDefinitions.has(name)) {
    metricDefinitions.set(name, { type, help, options });
  }
  if (type === 'counter') {
    getStore(counterStore, name);
  } else if (type === 'gauge') {
    getStore(gaugeStore, name);
  } else if (type === 'histogram') {
    getStore(histogramStore, name);
  }
};

const getCounterEntry = (name, labels = {}) => {
  const store = getStore(counterStore, name);
  const key = labelKey(labels);
  if (!store.has(key)) {
    store.set(key, { labels: normaliseLabels(labels), value: 0 });
  }
  return store.get(key);
};

const getGaugeEntry = (name, labels = {}) => {
  const store = getStore(gaugeStore, name);
  const key = labelKey(labels);
  if (!store.has(key)) {
    store.set(key, { labels: normaliseLabels(labels), value: 0 });
  }
  return store.get(key);
};

const getHistogramEntry = (name, labels = {}) => {
  const definition = metricDefinitions.get(name);
  if (!definition) {
    throw new Error(`Histogram ${name} is not defined`);
  }
  const store = getStore(histogramStore, name);
  const key = labelKey(labels);
  if (!store.has(key)) {
    const buckets = definition.options.buckets || [];
    store.set(key, {
      labels: normaliseLabels(labels),
      bucketCounts: new Array(buckets.length + 1).fill(0),
      sum: 0,
      count: 0
    });
  }
  return store.get(key);
};

const incCounter = (name, labels = {}, value = 1) => {
  const entry = getCounterEntry(name, labels);
  entry.value += value;
};

const setGauge = (name, labels = {}, value = 0) => {
  const entry = getGaugeEntry(name, labels);
  entry.value = value;
};

const incGauge = (name, labels = {}, value = 1) => {
  const entry = getGaugeEntry(name, labels);
  entry.value += value;
};

const decGauge = (name, labels = {}, value = 1) => {
  const entry = getGaugeEntry(name, labels);
  entry.value = Math.max(0, entry.value - value);
};

const observeHistogram = (name, labels = {}, value = 0) => {
  const entry = getHistogramEntry(name, labels);
  const definition = metricDefinitions.get(name);
  const buckets = definition.options.buckets || [];
  let index = buckets.findIndex((bucket) => value <= bucket);
  if (index === -1) {
    index = buckets.length;
  }
  entry.bucketCounts[index] += 1;
  entry.sum += value;
  entry.count += 1;
};

const renderMetrics = () => {
  const lines = [];

  for (const [name, definition] of metricDefinitions.entries()) {
    lines.push(`# HELP ${name} ${definition.help}`);
    lines.push(`# TYPE ${name} ${definition.type}`);

    if (definition.type === 'counter') {
      const store = counterStore.get(name) || new Map();
      for (const entry of store.values()) {
        lines.push(`${name}${formatLabels(entry.labels)} ${entry.value}`);
      }
    } else if (definition.type === 'gauge') {
      const store = gaugeStore.get(name) || new Map();
      for (const entry of store.values()) {
        lines.push(`${name}${formatLabels(entry.labels)} ${entry.value}`);
      }
    } else if (definition.type === 'histogram') {
      const store = histogramStore.get(name) || new Map();
      const buckets = definition.options.buckets || [];
      for (const entry of store.values()) {
        let cumulative = 0;
        entry.bucketCounts.forEach((count, idx) => {
          cumulative += count;
          const le = idx < buckets.length ? buckets[idx] : '+Inf';
          const labels = { ...entry.labels, le };
          lines.push(`${name}_bucket${formatLabels(labels)} ${cumulative}`);
        });
        lines.push(`${name}_sum${formatLabels(entry.labels)} ${entry.sum}`);
        lines.push(`${name}_count${formatLabels(entry.labels)} ${entry.count}`);
      }
    }
  }

  lines.push('# HELP process_uptime_seconds Process uptime in seconds');
  lines.push('# TYPE process_uptime_seconds gauge');
  lines.push(`process_uptime_seconds ${process.uptime()}`);

  const memoryUsage = process.memoryUsage();
  lines.push('# HELP nodejs_memory_usage_bytes Node.js memory usage');
  lines.push('# TYPE nodejs_memory_usage_bytes gauge');
  for (const [key, value] of Object.entries(memoryUsage)) {
    lines.push(`nodejs_memory_usage_bytes{type="${key}"} ${value}`);
  }

  return `${lines.join('\n')}\n`;
};

const getAppVersion = () => process.env.APP_VERSION || '5.0.0';

defineMetric('http_requests_total', 'counter', 'Total number of HTTP requests processed');
defineMetric(
  'http_request_duration_seconds',
  'histogram',
  'Duration of HTTP requests in seconds',
  { buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5] }
);
defineMetric('nodejs_active_requests', 'gauge', 'Number of in-flight HTTP requests');
defineMetric('application_errors_total', 'counter', 'Count of application level errors');
defineMetric(
  'application_readiness_status',
  'gauge',
  'Readiness status of the application: 1 ready, 0 not ready'
);
defineMetric('synthetic_latency_ms', 'gauge', 'Latency from synthetic availability checks in milliseconds');
defineMetric(
  'load_test_duration_seconds',
  'histogram',
  'Duration of ad-hoc load test executions',
  { buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10] }
);
defineMetric('application_info', 'gauge', 'Application information');

setGauge('application_info', { project: 'monitoring', version: getAppVersion() }, 1);

app.use((req, res, next) => {
  const requestStart = process.hrtime.bigint();
  const routeKey = req.path || req.originalUrl || '/unknown';

  incGauge('nodejs_active_requests', { route: routeKey });

  let handled = false;
  const recordMetrics = () => {
    const durationSeconds = Number(process.hrtime.bigint() - requestStart) / 1e9;
    const routePath = req.route?.path || routeKey;
    const labels = {
      method: req.method,
      route: routePath,
      status: res.statusCode
    };

    incCounter('http_requests_total', labels);
    observeHistogram('http_request_duration_seconds', labels, durationSeconds);
    decGauge('nodejs_active_requests', { route: routeKey });
  };

  const handler = () => {
    if (!handled) {
      handled = true;
      recordMetrics();
    }
  };

  res.on('finish', handler);
  res.on('close', handler);
  next();
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: getAppVersion(),
    hostname: os.hostname(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'production',
    project: 'DevOps Kubernetes',
    kubernetes: {
      namespace: process.env.KUBERNETES_NAMESPACE || 'default',
      pod_name: process.env.HOSTNAME || os.hostname(),
      service_account: process.env.KUBERNETES_SERVICE_ACCOUNT || 'default'
    }
  });
});

app.get('/ready', (req, res) => {
  const isReady = process.uptime() > 10;

  if (isReady) {
    setGauge('application_readiness_status', {}, 1);
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  } else {
    setGauge('application_readiness_status', {}, 0);
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      message: 'Application is starting up'
    });
  }
});

app.get('/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    pid: process.pid,
    uptime: process.uptime()
  });
});

app.get('/synthetic-check', async (req, res) => {
  const start = process.hrtime.bigint();
  await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 40)));
  const latencyMs = Number((process.hrtime.bigint() - start) / 1000000n);
  setGauge('synthetic_latency_ms', {}, latencyMs);

  res.status(200).json({
    status: 'ok',
    synthetic_latency_ms: latencyMs,
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  const version = getAppVersion();
  setGauge('application_info', { project: 'monitoring', version }, 1);

  res.json({
    message: 'Hello from DevOps Project 4 - Monitoring & Observability!',
    hostname: os.hostname(),
    timestamp: new Date().toISOString(),
    version,
    project: 'DevOps Monitoring',
    features: [
      'Prometheus metrics collection',
      'Grafana dashboards and visualization',
      'Loki log aggregation',
      'AlertManager notifications',
      'SLO tracking and error budgets',
      'Kubernetes monitoring'
    ],
    kubernetes_info: {
      namespace: process.env.KUBERNETES_NAMESPACE || 'default',
      pod_name: process.env.HOSTNAME || os.hostname(),
      node_name: process.env.KUBERNETES_NODE_NAME || 'unknown',
      cluster: 'devops-project-4'
    }
  });
});

app.get('/load/:intensity?', (req, res) => {
  const requested = req.params.intensity ? Number(req.params.intensity) : 1;

  if (!Number.isFinite(requested) || requested <= 0) {
    incCounter('application_errors_total', { route: '/load/:intensity?', type: '400' });
    return res.status(400).json({
      message: 'Intensity must be a positive number',
      provided: req.params.intensity
    });
  }

  const intensity = Math.min(Math.max(Math.round(requested), 1), 20);
  const iterations = intensity * 10000;
  const startTimeNs = process.hrtime.bigint();

  let result = 0;
  let computationErrors = 0;

  try {
    for (let i = 0; i < iterations; i += 1) {
      result += Math.sqrt(i);
    }
  } catch (error) {
    computationErrors += 1;
    incCounter('application_errors_total', { route: '/load/:intensity?', type: '500' });
    return res.status(500).json({ message: 'Load generation failed', error: error.message });
  }

  const durationSeconds = Number(process.hrtime.bigint() - startTimeNs) / 1e9;
  observeHistogram('load_test_duration_seconds', { intensity: intensity.toString() }, durationSeconds);

  res.json({
    message: 'Load test completed',
    intensity,
    iterations,
    duration_ms: Math.round(durationSeconds * 1000),
    result: result.toString().substring(0, 10),
    computationErrors,
    hostname: os.hostname(),
    timestamp: new Date().toISOString()
  });
});

app.get('/metrics', (req, res) => {
  try {
    res.set('Content-Type', METRICS_CONTENT_TYPE);
    res.send(renderMetrics());
  } catch (err) {
    incCounter('application_errors_total', { route: '/metrics', type: '500' });
    res.status(500).json({ message: 'Unable to collect metrics', error: err.message });
  }
});

app.use((err, req, res, next) => {
  const routePath = req.route?.path || req.path || 'unknown';
  incCounter('application_errors_total', { route: routePath, type: '500' });
  res.status(500).json({ message: 'Unhandled server error', error: err.message });
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 DevOps Project 5 - Advanced Monitoring server running on port ${port}`);
  console.log(`📱 Health: http://localhost:${port}/health`);
  console.log(`✅ Ready: http://localhost:${port}/ready`);
  console.log(`💓 Live: http://localhost:${port}/live`);
  console.log(`📊 Metrics: http://localhost:${port}/metrics`);
  console.log(`⚡ Load test: http://localhost:${port}/load/5`);
  console.log(`🌐 Main: http://localhost:${port}`);
});
