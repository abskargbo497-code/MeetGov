/**
 * STORAGE SERVICE
 *
 * Handles Google Cloud Storage operations for file uploads and deletions.
 */

import { Storage } from '@google-cloud/storage';
import logger from '../logger/index';

class StorageService {
  private storage: Storage;
  private bucketName: string;

  constructor() {
    this.storage = new Storage();
    this.bucketName = process.env.STORAGE_BUCKET_NAME || 'default-bucket';
  }

  getBucketName(): string {
    return this.bucketName;
  }

  getPublicUrl(objectName: string): string {
    return `https://storage.googleapis.com/${this.bucketName}/${objectName}`;
  }

  // Signed URL generation was moved to a dedicated signer backend service (e.g. Cloud Run).
  // Reason: local OAuth-based development credentials typically cannot sign V4 URLs reliably,
  // and keeping signing isolated reduces exposure of credential scope in the main API.

  async uploadFile(filePath: string, destination: string): Promise<string> {
    try {
      logger.info(`Uploading ${filePath} to ${destination}...`);
      await this.storage.bucket(this.bucketName).upload(filePath, {
        destination,
        resumable: false,
      });
      const publicUrl = this.getPublicUrl(destination);
      logger.info(`File uploaded successfully: ${publicUrl}`);
      return publicUrl;
    } catch (error: any) {
      logger.error(`GCS Upload Error: ${error.message}`);
      throw error;
    }
  }

  async deleteFile(fileName: string): Promise<void> {
    try {
      logger.info(`Deleting ${fileName} from ${this.bucketName}...`);
      await this.storage.bucket(this.bucketName).file(fileName).delete();
      logger.info(`File ${fileName} deleted.`);
    } catch (error: any) {
      logger.error(`GCS Delete Error: ${error.message}`);
      throw error;
    }
  }
}

export default new StorageService();
