# Streaming data from Cloud Storage into BigQuery using Cloud Function

Cloud function in Node.js to stream newline-delimited JSON from Google storage bucket into BigQuery table. 
Cloud function will be triggered when a new object is created (or an existing object is overwritten) in the bucket.
Cloud function will read the JSON file, and it will insert the data into the BigQuery table.
A shell script is used to deploy cloud function.


**Note:** 

Following are the cloud function names in `index.js`:

* `streamJsonToTable` **streaming** data triggered by new file addition in storage bucket. 

BigQuery dataset and time-partitioned by `DAY` table must already exists before deploy cloud function.


## Set up

Prerequisite:
1. Install [Node.js version 10 or greater][node]

1. Install [Yarn][yarn]

Clone this repository:

    git clone git@github.com:broadinstitute/gcs-to-bigquery-cloud-function.git

Install dependencies:

    yarn install

**Note**:
Before deploy cloud function, change cloud function name to avoid overwritting already-deployed cloud function in same Google project.

## GCS set up

Prerequisite:
* Install [Google Cloud SDK](https://cloud.google.com/sdk/docs/install)
* Optional update `gcloud` SDK components: 
        
        gcloud components update

Use Google [Console][console] or `bq mk` CLI to create if not exists:

    GCS bucket: `[YOUR_GCS_BUCKET]`
    BigQuery dataset: `[YOUR_BIGQUERY_DATASET_ID]`
    BigQuery table: `[YOUR_BIGQUERY_TABLE_ID]`

`bq mk` CLI:

    gcloud config set project [YOUR_GOOGLE_PROJECT_ID]
    bq mk --dataset [YOUR_BIGQUERY_DATASET_ID]
    bq mk --table [YOUR_BIGQUERY_TABLE_ID] --schema [YOUR_TABLE_SCHEMA] --time_partitioning_type DAY

**Note**:
Table schema should match your JSON objects. An example of schema is in `bq_schema` directory.
        
[node]: https://nodejs.org/
[yarn]: https://classic.yarnpkg.com/en/
[console]: https://console.cloud.google.com/projectselector2/home/dashboard?_ga=2.115570191.825733084.1603125786-1984668711.1592421217

## Deploy streaming cloud function

1. Set following environment variables:
   
       export PROJECT_ID=[YOUR_GOOGLE_PROJECT_ID]
       export GCS_BUCKET=[YOUR_GCS_BUCKET]
       export BQ_DATASET=[YOUR_BIGQUERY_DATASET_ID]
       export BQ_TABLE=[YOUR_BIGQUERY_TABLE_ID]
      
 1. Run `deploy-cloud-function.sh` with parameters:
    * Required `--function` parameter: deploy this cloud function name (function must exists inside `index.js`)
    * Optional `--project` parameter: To overrid environment variable `PROJECT_ID`
    * Optional `--bucket` paramter: To overrid environment varible `GCS_BUCKET`)
    * Optional `--runtime` parameter: Node.js runtime (default is nodejs10)

    ```
    ./deploy-cloud-function.sh --project [YOUR_PROJECT_ID] --bucket [YOUR_GCS_BUCKET] --function [CLOUD_FUNCTION_NAME] --runtime [YOUR_NODEJS_RUNTIME]
    ```
    
    Example:
    ```
    ./deploy-cloud-function.sh --function loadJsonToTable
    ```
   
    ```
    ./deploy-cloud-function.sh --project broad-dsde-qa --bucket integration-test-results --function loadJsonToTable
    ```

    ```
    ./deploy-cloud-function.sh --project broad-dsde-qa --bucket integration-test-results --function loadJsonToTable --runtime nodejs12
    ```

    * For a complete list of `[YOUR_NODEJS_RUNTIME]`, see [gcloud runtime reference](https://cloud.google.com/sdk/gcloud/reference/functions/deploy#--runtime).

    

### Links    
* [Cloud Function using Node.js runtime](https://cloud.google.com/nodejs/)
* [GCS Node.js Client](https://googleapis.dev/nodejs/storage/latest/)
* [Bucket TRIGGER_EVENT_TYPE](https://cloud.google.com/functions/docs/calling/storage)
