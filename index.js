'use strict';

const {BigQuery} = require('@google-cloud/bigquery');
const {Storage} = require('@google-cloud/storage');

const DATASET_ID = process.env.BQ_DATASET;
const TABLE_ID = process.env.BQ_TABLE;
const PROJECT_ID = process.env.PROJECT_ID;

const bigquery = new BigQuery({projectId: PROJECT_ID});
const storage = new Storage();

/**
 * Cloud function streaming JSON file from GCS bucket. Triggered from a new file addition in storage bucket.
 *
 * @param {object} data The event payload.
 * @param {object} context The event metadata.
 */
exports.streamJsonToBQTable = async (data, context) => {
  if (!validateJsonFile(data.name)) {
    return;
  }
  console.log(`Start streaming JSON file: ${data.name} from bucket ${data.bucket}, created on ${data.timeCreated}`);

  await insertRow(data);

  // Uncomment if wish to delete file in bucket
  // await deleteBucketFile(data.bucket, fileName).catch(err => console.error(err));
};


/**
 * Cloud function loads JSON file from GCS bucket. Triggered from a new file addition in storage bucket.
 *
 * @param {object} data The event payload.
 * @param {object} context The event metadata.
 */
exports.loadJsonToBQTable = async (data, context) => {
  if (!validateJsonFile(data.name)) {
    return;
  }
  console.log(`Start loading JSON file: ${data.name} from bucket ${data.bucket}, created on ${data.timeCreated}`);

  await loadRow(data);

  // Uncomment if wish to delete file in bucket
  // await deleteBucketFile(data.bucket, fileName).catch(err => console.error(err));
};

/**
 * Cloud function triggered from a message on a Cloud Pub/Sub topic.
 *
 * topics: aouPuppeteerTestResults
 * subscription: aou-test-results-subscription
 *
 * @param {object} message The Cloud Pub/Sub Message object.
 * @param {object} context The event metadata.
 */
exports.subscribeTestMessage = async (message, context) => {
  const messageData = Buffer.from(message.data, 'base64').toString();
  console.log(`Subscribe processing message: ${JSON.stringify(message)}`);
  console.log(`  Data: ${messageData}`);
  console.log(`  Attributes: ${JSON.stringify(message.attributes)}`);

  // Parse message for storage bucket and json file names.
  const file = message.attributes.file;
  const bucket = message.attributes.bucket;
  const data = {
    bucket: bucket,
    name: file,
  };

  console.log(`Start loading JSON file: ${data.name} from bucket ${data.bucket}.`);
  await loadRow(data);

  message.ack();

  // Uncomment if wish to delete file in bucket
  // await deleteBucketFile(bucket, file).catch(err => console.error(err));
};


// *********** Helper functions ***********

function validateJsonFile(fileName) {
  if (fileName.endsWith('.json')) {
    return true;
  }
  console.log(`File ${fileName} is not a JSON.`);
  return false;
}

// Inserts the JSON into BigQuery table.
async function insertRow(data) {
  // const [file] = await storage
  //  .bucket(data.bucket)
  //  .file(data.name)
  //  .download();
  // const jsonString = JSON.parse(file.toString('utf8'));

  try {
    // Throw error if table not found. Cannot insert data into table that does'n exists.
    await getTable(DATASET_ID, TABLE_ID);
  } catch (err) {
    console.log(`Get table failed with following error: ${err}`);
    console.log(`Try loading JSON to table ${TABLE_ID}`);
    return loadRow(data);
  }

  const date = getTodayDate();
  const js = await readFile(data);

  // Append partition decorator to table id. Partition decorator ($YYYYMMDD format) enables inserting data into a time-partitioned table.
  const table = await bigquery.dataset(DATASET_ID).table(`${TABLE_ID}$${date}`);
  await table.insert(js, insertOptions, function(err, response) {
    console.log(`Insert row err: ${JSON.stringify(err)}`);
    console.log(`Insert row response: ${JSON.stringify(response)}`);
  });
  console.log(`Job completed inserting ${data.name} from gs://${data.bucket} into BigQuery ${DATASET_ID}.${TABLE_ID}`);
}

const loadOptions = {
  // For full list of table options, see https://cloud.google.com/bigquery/docs/reference/v2/tables#resource
  // For full list of table load options, see: https://cloud.google.com/bigquery/docs/reference/rest/v2/Job#JobConfigurationLoad
  autodetect: true,
  sourceFormat: 'NEWLINE_DELIMITED_JSON',
  WriteDisposition: 'WRITE_APPEND',
  CreateDisposition: 'CREATE_IF_NEEDED',
  ignoreUnknownValues: true,
  schemaUpdateOptions: [
    'ALLOW_FIELD_ADDITION'
  ],
  timePartitioning: {
    type: 'DAY',
    expirationMS: '5184000000', // 60 days
  },
  destinationTable: {
    "projectId": PROJECT_ID,
    "datasetId": DATASET_ID,
    "tableId": TABLE_ID
  },
  location: 'US',
};

const insertOptions = {
  ignoreUnknownValues: true
}

// Loading data into BigQuery table. Create new time-partitioned table if not exists.
async function loadRow(data) {
  // const [job] = await bigquery
  //  .dataset(DATASET_ID)
  //  .table(TABLE_ID)
  //  .load(storage.bucket(data.bucket).file(data.name), loadOptions);

  const [table] = await getTable(DATASET_ID, TABLE_ID);
  const [job] = table.load(storage.bucket(data.bucket).file(data.name), loadOptions);

  // Check the job's status for errors
  const errors = job.status.errors;
  if (errors && errors.length > 0) {
    throw errors;
  }
  console.log(`Job ${job.id} completed loading ${data.name} from gs://${data.bucket} into BigQuery ${DATASET_ID}.${TABLE_ID}`);
}

async function deleteBucketFile(bucket, file) {
  await storage.bucket(bucket).file(file).delete();
  console.log(`Delete file: ${file}`);
}

async function createDataset(bigquery, datasetId) {
  const [dataset] = await bigquery.createDataset(datasetId, {location: 'US'});
  console.log(`Dataset ${dataset.id} created.`);
}

async function createTable(bigquery, datasetId, tableId) {
  const [table] = await bigquery
    .dataset(datasetId)
    .createTable(tableId, {location: 'US'});
  console.log(`Table ${table.id} created.`);
}

async function getTable(datasetId, tableId) {
  const dataset = bigquery.dataset(datasetId);
  return dataset
    .get()
    .then(([dataset]) =>
      dataset
        .table(tableId)
        .get()
    );
}

// Returns a JSON string.
async function readFile(data) {
  const file = await storage
    .bucket(data.bucket)
    .file(data.name)
    .download();
  return JSON.parse(file[0].toString('utf8'));
}

function getTodayDate() {
  const currentDate = new Date();
  const date = currentDate.getDate();
  const month = currentDate.getMonth(); // January is 0
  const year = currentDate.getFullYear();
  return `${year}${(month + 1)}${date}`;
}
