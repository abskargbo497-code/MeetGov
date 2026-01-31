/**
 * EXAMPLE: Meeting Controller with Context-Based Authentication
 * 
 * This file demonstrates the NEW context-based middleware system.
 * Use this as a reference when implementing new controllers.
 * 
 * REQUIRED MIDDLEWARE CHAIN:
 * request → resolveIdentity() → enforceSingleIdentity() → attachContext() → role/permission guards → controller
 * 
 * Key differences from identity-based approach:
 * - Use req.context instead of req.identity
 * - Context provides standardized access to user info and permissions
 * - Cleaner separation between authentication and authorization
 */

import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import Logger from '../logger/index';

export const createMeeting = async (req: Request, res: Response) => {
    try {
        if (!req.context) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required',
            });
        }

        const { title, description, location, scheduledStart, scheduledEnd } = req.body;

        if (!title) {
            return res.status(400).json({
                success: false,
                message: 'Title is required',
            });
        }

        let ownerType: 'PERSONAL' | 'GUEST';
        let ownerId: string;

        switch (req.context.identityType) {
            case 'PERSONAL':
            case 'ENTERPRISE':
                ownerType = 'PERSONAL';
                ownerId = req.context.userId!;
                break;
            case 'GUEST':
            case 'PARTICIPANT':
                ownerType = 'GUEST';
                ownerId = req.context.participantId || 'guest-session-id';
                break;
        }

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 90);

        const meeting = await prisma.meeting.create({
            data: {
                title,
                description,
                location,
                scheduledStart: scheduledStart ? new Date(scheduledStart) : null,
                scheduledEnd: scheduledEnd ? new Date(scheduledEnd) : null,
                ownerType,
                ownerId,
                enterpriseId: req.context.enterpriseId || null,
                expiresAt,
            },
        });

        Logger.info(`Meeting created: ${meeting.id} by ${req.context.identityType} ${ownerId}`);

        res.status(201).json({
            success: true,
            data: meeting,
        });
    } catch (error: any) {
        Logger.error(`Failed to create meeting: ${error.message}`);
        res.status(400).json({
            success: false,
            message: error.message,
        });
    }
};

export const getMeeting = async (req: Request, res: Response) => {
    try {
        if (!req.context) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required',
            });
        }

        const meetingId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

        const meeting = await prisma.meeting.findUnique({
            where: { id: meetingId },
        });

        if (!meeting) {
            return res.status(404).json({
                success: false,
                message: 'Meeting not found',
            });
        }

        if (req.context.identityType === 'ENTERPRISE') {
            if (meeting.enterpriseId !== req.context.enterpriseId) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied: Resource belongs to different enterprise',
                });
            }
        } else {
            let ownerId: string;
            switch (req.context.identityType) {
                case 'PERSONAL':
                    ownerId = req.context.userId!;
                    break;
                case 'GUEST':
                case 'PARTICIPANT':
                    ownerId = req.context.participantId || 'guest-session-id';
                    break;
            }

            const ownerType = req.context.identityType === 'PERSONAL' ? 'PERSONAL' : 'GUEST';

            if (meeting.ownerType !== ownerType || meeting.ownerId !== ownerId) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied: You do not own this resource',
                });
            }
        }

        res.json({
            success: true,
            data: meeting,
        });
    } catch (error: any) {
        Logger.error(`Failed to get meeting: ${error.message}`);
        res.status(400).json({
            success: false,
            message: error.message,
        });
    }
};

export const updateMeeting = async (req: Request, res: Response) => {
    try {
        if (!req.context) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required',
            });
        }

        if (!req.context.permissions.includes('write:own') && !req.context.permissions.includes('write:enterprise')) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions',
            });
        }

        const meetingId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

        const meeting = await prisma.meeting.findUnique({
            where: { id: meetingId },
        });

        if (!meeting) {
            return res.status(404).json({
                success: false,
                message: 'Meeting not found',
            });
        }

        if (req.context.identityType === 'ENTERPRISE') {
            if (meeting.enterpriseId !== req.context.enterpriseId) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied: Resource belongs to different enterprise',
                });
            }
        } else {
            let ownerId: string;
            switch (req.context.identityType) {
                case 'PERSONAL':
                    ownerId = req.context.userId!;
                    break;
                case 'GUEST':
                case 'PARTICIPANT':
                    ownerId = req.context.participantId || 'guest-session-id';
                    break;
            }

            const ownerType = req.context.identityType === 'PERSONAL' ? 'PERSONAL' : 'GUEST';

            if (meeting.ownerType !== ownerType || meeting.ownerId !== ownerId) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied: You do not own this resource',
                });
            }
        }

        const { title, description, location, scheduledStart, scheduledEnd } = req.body;

        const updatedMeeting = await prisma.meeting.update({
            where: { id: meetingId },
            data: {
                ...(title !== undefined && { title }),
                ...(description !== undefined && { description }),
                ...(location !== undefined && { location }),
                ...(scheduledStart !== undefined && { scheduledStart: new Date(scheduledStart) }),
                ...(scheduledEnd !== undefined && { scheduledEnd: new Date(scheduledEnd) }),
            },
        });

        Logger.info(`Meeting updated: ${meetingId} by ${req.context.identityType}`);

        res.json({
            success: true,
            data: updatedMeeting,
        });
    } catch (error: any) {
        Logger.error(`Failed to update meeting: ${error.message}`);
        res.status(400).json({
            success: false,
            message: error.message,
        });
    }
};

export const deleteMeeting = async (req: Request, res: Response) => {
    try {
        if (!req.context) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required',
            });
        }

        if (!req.context.permissions.includes('delete:own') && !req.context.permissions.includes('delete:enterprise')) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions',
            });
        }

        const meetingId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

        const meeting = await prisma.meeting.findUnique({
            where: { id: meetingId },
        });

        if (!meeting) {
            return res.status(404).json({
                success: false,
                message: 'Meeting not found',
            });
        }

        if (req.context.identityType === 'ENTERPRISE') {
            if (meeting.enterpriseId !== req.context.enterpriseId) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied: Resource belongs to different enterprise',
                });
            }
        } else {
            let ownerId: string;
            switch (req.context.identityType) {
                case 'PERSONAL':
                    ownerId = req.context.userId!;
                    break;
                case 'GUEST':
                case 'PARTICIPANT':
                    ownerId = req.context.participantId || 'guest-session-id';
                    break;
            }

            const ownerType = req.context.identityType === 'PERSONAL' ? 'PERSONAL' : 'GUEST';

            if (meeting.ownerType !== ownerType || meeting.ownerId !== ownerId) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied: You do not own this resource',
                });
            }
        }

        await prisma.meeting.delete({
            where: { id: meetingId },
        });

        Logger.info(`Meeting deleted: ${meetingId} by ${req.context.identityType}`);

        res.json({
            success: true,
            message: 'Meeting deleted successfully',
        });
    } catch (error: any) {
        Logger.error(`Failed to delete meeting: ${error.message}`);
        res.status(400).json({
            success: false,
            message: error.message,
        });
    }
};
