import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import Logger from '../../logger/index';

interface SignedUrlParams {
    objectName: string;
    contentType: string;
    expiresInMinutes?: number;
}

interface DownloadUrlParams {
    objectName: string;
    contentType: string;
    expiresInMinutes?: number;
    responseContentDisposition?: string;
}

class R2StorageService {
    private client: S3Client;
    private bucketName: string;

    constructor() {
        const accountId = process.env.R2_ACCOUNT_ID;
        const accessKeyId = process.env.R2_ACCESS_KEY_ID;
        const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
        const bucketName = process.env.R2_BUCKET_NAME;
        const endpoint = process.env.R2_ENDPOINT;

        if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !endpoint) {
            throw new Error('R2 configuration is incomplete. Check environment variables.');
        }

        this.bucketName = bucketName;

        // Initialize S3 client with R2 credentials
        this.client = new S3Client({
            region: 'auto', // R2 uses 'auto' as region
            endpoint: endpoint,
            credentials: {
                accessKeyId: accessKeyId,
                secretAccessKey: secretAccessKey,
            },
        });

        Logger.info('r2_storage_initialized', { bucketName });
    }

    /**
     * Generate a presigned URL for uploading a file
     */
    async createSignedUploadUrl(params: SignedUrlParams): Promise<{ url: string; expiresAt: Date }> {
        const defaultTtl = parseInt(process.env.SIGNER_UPLOAD_TTL_MINUTES || '15', 10);
        const expiresInMinutes = params.expiresInMinutes ?? defaultTtl;
        const expiresInSeconds = expiresInMinutes * 60;

        try {
            const command = new PutObjectCommand({
                Bucket: this.bucketName,
                Key: params.objectName,
                ContentType: params.contentType,
            });

            const url = await getSignedUrl(this.client, command, {
                expiresIn: expiresInSeconds,
            });

            const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

            Logger.info('r2_upload_url_generated', {
                objectName: params.objectName,
                expiresAt: expiresAt.toISOString(),
            });

            return { url, expiresAt };
        } catch (error) {
            Logger.error('r2_upload_url_error', {
                objectName: params.objectName,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw new Error('Failed to generate upload URL');
        }
    }

    /**
     * Generate a presigned URL for downloading a file
     */
    async createSignedDownloadUrl(params: DownloadUrlParams): Promise<{ url: string; expiresAt: Date }> {
        const defaultTtl = parseInt(process.env.SIGNER_DOWNLOAD_TTL_MINUTES || '60', 10);
        const expiresInMinutes = params.expiresInMinutes ?? defaultTtl;
        const expiresInSeconds = expiresInMinutes * 60;

        try {
            const command = new GetObjectCommand({
                Bucket: this.bucketName,
                Key: params.objectName,
                ResponseContentType: params.contentType,
                ResponseContentDisposition: params.responseContentDisposition,
            });

            const url = await getSignedUrl(this.client, command, {
                expiresIn: expiresInSeconds,
            });

            const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

            Logger.info('r2_download_url_generated', {
                objectName: params.objectName,
                expiresAt: expiresAt.toISOString(),
            });

            return { url, expiresAt };
        } catch (error) {
            Logger.error('r2_download_url_error', {
                objectName: params.objectName,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw new Error('Failed to generate download URL');
        }
    }

    /**
     * Download a file from R2 storage
     */
    async downloadFile(objectName: string): Promise<Buffer> {
        try {
            const command = new GetObjectCommand({
                Bucket: this.bucketName,
                Key: objectName,
            });

            const response = await this.client.send(command);

            if (!response.Body) {
                throw new Error('No file content received from R2');
            }

            // Convert stream to buffer
            const buffer = Buffer.from(await response.Body.transformToByteArray());

            Logger.info('r2_file_downloaded', {
                objectName,
                size: buffer.length,
            });

            return buffer;
        } catch (error) {
            Logger.error('r2_download_error', {
                objectName,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw new Error('Failed to download file from R2');
        }
    }
}

export default new R2StorageService();
