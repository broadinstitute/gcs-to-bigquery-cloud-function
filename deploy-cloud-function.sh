#!/bin/bash

NODEJS_RUNTIME=${runtime:-nodejs10}

if [ $# -eq 0 ]
  then
    echo "No argument supplied. Require arguments: --function"
    exit 1
fi

while [ $# -gt 0 ]; do
  case "$1" in
    --project*)
      if [[ "$1" != *=* ]]; then shift; fi # Value is next arg if no `=`
      PROJECT_ID="${1#*=}"
      ;;
    --bucket*)
      if [[ "$1" != *=* ]]; then shift; fi
      GCS_BUCKET="${1#*=}"
      ;;
    --function*)
      if [[ "$1" != *=* ]]; then shift; fi
      CLOUD_FUNCTION="${1#*=}"
      ;;
    --runtime*)
      if [[ "$1" != *=* ]]; then shift; fi
      NODEJS_RUNTIME="${1#*=}"
      ;;
    *)
      >&2 printf "Error: Invalid argument.\n"
      exit 1
      ;;
  esac
  shift
done

if [ "x$BQ_DATASET" == "x"  ]; then
     echo "Required environment variable is not set: BQ_DATASET"
    exit 1
fi

if [ "x$BQ_TABLE" == "x"  ]; then
     echo "Required environment variables is not set: BQ_TABLE"
    exit 1
fi

if [ "x$GCS_BUCKET" == "x"  ]; then
     echo "Required environment variables is not set: GCS_BUCKET"
    exit 1
fi

if [ "x$CLOUD_FUNCTION" == "x"  ]; then
     echo "Required environment variables is not set: CLOUD_FUNCTION"
    exit 1
fi

echo "PROJECT_ID: ${PROJECT_ID}"
echo "GCS_BUCKET: ${GCS_BUCKET}"
echo "CLOUD_FUNCTION: ${CLOUD_FUNCTION}"
echo "BQ_DATASET: ${BQ_DATASET}"
echo "BQ_TABLE: ${BQ_TABLE}"

gcloud functions deploy ${CLOUD_FUNCTION} \
  --update-env-vars BQ_DATASET=${BQ_DATASET},BQ_TABLE=${BQ_TABLE},PROJECT_ID=${PROJECT_ID} \
  --project=${PROJECT_ID} \
  --runtime ${NODEJS_RUNTIME} \
  --trigger-resource ${GCS_BUCKET} \
  --trigger-event google.storage.object.finalize
