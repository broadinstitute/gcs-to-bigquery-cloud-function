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
exports.streamJsonToTable = async (data, context) => {
  if (!validateJsonFile(data.name)) {
    return;
  }
  await insertRow(data);

  // Uncomment if wish to delete file in bucket
  // await deleteFile(data.bucket, fileName).catch(err => console.error(err));
};


// *********** Helper functions ***********

function validateJsonFile(fileName) {
  if (fileName.endsWith('.json')) {
    return true;
  }
  console.log(`File ${fileName} is not a JSON.`);
  return false;
}

const loadOptions = {
  // Full list of table options, see https://cloud.google.com/bigquery/docs/reference/v2/tables#resource
  // Full list of table load options, see: https://cloud.google.com/bigquery/docs/reference/rest/v2/Job#JobConfigurationLoad
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

// Inserting data into BigQuery table.
async function insertRow(data) {
  try {
    // Throw error if table not found.
    const [dataset] = await bigquery.dataset(DATASET_ID).get({autoCreate: true});
    await dataset.table(TABLE_ID).get();
  } catch (err) {
    console.log(`Get table failed with error: ${err}`);
    console.log(`Try loading JSON to table ${TABLE_ID}`);
    return await loadRow(data);
  }

  const date = getTodayDate();
  const js = await readFile(data);

  // Append partition decorator to table id. Partition decorator ($YYYYMMDD format) enables inserting data into a time-partitioned table.
  console.log(`Start streaming JSON file: ${data.name} from bucket ${data.bucket}, created on ${data.timeCreated}`);

  const table = await bigquery.dataset(DATASET_ID).table(`${TABLE_ID}$${date}`);
  await table.insert(js, insertOptions, function(err, response) {
    console.log(`Insert row err: ${JSON.stringify(err)}`);
  });
  console.log(`Job completed streaming ${data.name} from gs://${data.bucket} into BigQuery ${DATASET_ID}.${TABLE_ID}`);
}

// Loading data into BigQuery table. Create new time-partitioned table if not exists.
async function loadRow(data) {
  const table = bigquery.dataset(DATASET_ID).table(TABLE_ID);
  console.log(`Start loading JSON file: ${data.name} from bucket ${data.bucket}, created on ${data.timeCreated}`);
  const [job] = await table.load(storage.bucket(data.bucket).file(data.name), loadOptions);

  // Check the job's status for errors
  const errors = job.status.errors;
  if (errors && errors.length > 0) {
    throw errors;
  }
  console.log(`Job ${job.id} completed loading ${data.name} from gs://${data.bucket} into BigQuery ${DATASET_ID}.${TABLE_ID}`);
}

// Returns a JSON string.
async function readFile(data) {
  const [file] = await storage
    .bucket(data.bucket)
    .file(data.name)
    .download();
  return JSON.parse(file.toString('utf8'));
}

async function deleteFile(bucket, file) {
  await storage
    .bucket(bucket)
    .file(file)
    .delete();
  console.log(`Deleted file: ${file}`);
}

function getTodayDate() {
  const currentDate = new Date();
  const date = currentDate.getDate();
  const month = currentDate.getMonth(); // January is 0
  const year = currentDate.getFullYear();
  return `${year}${(month + 1)}${date}`;
}
