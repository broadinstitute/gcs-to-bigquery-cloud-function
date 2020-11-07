'use strict';

const {BigQuery} = require('@google-cloud/bigquery');
const {Storage} = require('@google-cloud/storage');

const datasetId = process.env.BQ_DATASET;
const tableId = process.env.BQ_TABLE;

/**
 * Load JSON file from storage bucket. Triggered from a new file addition in storage bucket.
 *
 * @param {object} data The event payload.
 * @param {object} context The event metadata.
 */
exports.loadTestResults = async (data, context) => {
  if (!data.name.endsWith('.json')) {
    console.log(`File ${data.name} is not a JSON, exit function.`);
    return;
  }

  console.log(`Processing file: ${data.name} from bucket ${data.bucket}, created on ${data.timeCreated}`);

  const job = await bqLoad(data);
  console.log(`Job ${job.id} completed loading ${data.name} from gs://${data.bucket} into BigQuery ${datasetId}.${tableId}`);

  // Check the job's status for errors
  const errors = job.status.errors;
  if (errors && errors.length > 0) {
    throw errors;
  }

  // Uncomment if wish to delete file in bucket
  // await deleteBucketFile(data.bucket, fileName).catch(err => console.error(err));
};


/**
 * Stream JSON file from storage bucket. Triggered from a new file addition in storage bucket.
 *
 * @param {object} data The event payload.
 * @param {object} context The event metadata.
 */
exports.streamTestResults = async (data, context) => {
  const fileName = data.name;
  if (!fileName.endsWith('.json')) {
    console.log(`File ${fileName} is not json, exit function.`);
    return;
  }

  console.log(`Processing file: ${fileName}`);
  console.log(`  Bucket: ${data.bucket}`);
  console.log(`  Created: ${data.timeCreated}`);

  await bqInsert(data);
  console.log(`Job completed inserting ${fileName} from gs://${data.bucket} into BigQuery ${datasetId}.${tableId}`);

  // Uncomment if wish to delete file in bucket
  // await deleteBucketFile(data.bucket, fileName).catch(err => console.error(err));
};


/**
 * Triggered from a message on a Cloud Pub/Sub topic.
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

  const job = await bqLoad(data);
  console.log(`Job ${job.id} completed loading from gs://${bucket}/${file} into BigQuery ${datasetId}.${tableId}`);

  message.ack();

  // Uncomment if wish to delete file in bucket
  // await deleteBucketFile(bucket, file).catch(err => console.error(err));
};


const bqLoad = async (data) => {
  // Load options. For full list of options, see: https://cloud.google.com/bigquery/docs/reference/rest/v2/Job#JobConfigurationLoad
  const bqTableOptions = {
    sourceFormat: 'NEWLINE_DELIMITED_JSON',
    WriteDisposition: 'WRITE_APPEND',
    CreateDisposition: 'CREATE_IF_NEEDED',
    ignoreUnknownValues: true,
    autodetect: true,
    schemaUpdateOptions: [
      'ALLOW_FIELD_ADDITION'
    ],
    location: 'US',
  };

  // Imports a GCS file from a GCS bucket into a table.
  const bigquery = new BigQuery();
  const storage = new Storage();

  const [job] = await bigquery
    .dataset(datasetId)
    .table(tableId)
    .load(storage.bucket(data.bucket).file(data.name), bqTableOptions);

  return job;
}

const bqInsert = async (data) => {
  const bigquery = new BigQuery();
  const storage = new Storage();

  const [file] = await storage
    .bucket(data.bucket)
    .file(data.name)
    .download();
  const contents = JSON.stringify(file.toString('utf8'));
  console.log(`contents: ${contents}`);

  // Insert options.
  const options = {
    ignoreUnknownValues: true,
  }

  const resp = await bigquery
    .dataset(datasetId)
    .table(tableId)
    .insert(contents, options);

  console.log(`insert data completed: ${JSON.stringify(resp)}`);
  return resp;
}

const deleteBucketFile = async (bucket, file) => {
  const storage = new Storage();
  await storage.bucket(bucket).file(file).delete();
  console.log(`Delete file: ${file}`);
}
