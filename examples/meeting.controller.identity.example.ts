/**
 * EXAMPLE: Meeting Controller with Authoritative Identity System
 * 
 * This file demonstrates how to use the new identity system in controllers.
 * Use this as a reference when migrating existing controllers.
 */

import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import Logger from '../logger/index';
import {
    assertIdentityExists,
    getOwnershipFromIdentity,
    assertResourceOwnership,
    assertEnterpriseIsolation,
} from '../middlewares/auth';
import { IdentityType } from '../types/identity.types';

export const createMeeting = async (req: Request, res: Response) => {
    try {
        const identity = assertIdentityExists(req);
        const ownership = getOwnershipFromIdentity(identity);

        const { title, description, location, scheduledStart, scheduledEnd } = req.body;

        if (!title) {
            return res.status(400).json({
                success: false,
                message: 'Title is required',
            });
        }

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 90);

        const meeting = await prisma.meeting.create({
            data: {
                title,
                description: description || null,
                location: location || null,
                scheduledStart: scheduledStart ? new Date(scheduledStart) : null,
                scheduledEnd: scheduledEnd ? new Date(scheduledEnd) : null,
                ownerType: ownership.ownerType,
                ownerId: ownership.ownerId,
                enterpriseId: ownership.enterpriseId || null,
                guestSessionId: identity.type === IdentityType.GUEST ? identity.sessionId : null,
                expiresAt,
            },
        });

        Logger.info(`Meeting created: ${meeting.id} by ${identity.type} ${ownership.ownerId}`);

        res.status(201).json({
            success: true,
            meeting,
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
        const identity = assertIdentityExists(req);
        const meetingId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

        const meeting = await prisma.meeting.findUnique({
            where: { id: meetingId },
            include: {
                attendances: true,
                tasks: true,
            },
        });

        if (!meeting) {
            return res.status(404).json({
                success: false,
                message: 'Meeting not found',
            });
        }

        assertResourceOwnership(identity, meeting.ownerType, meeting.ownerId);

        assertEnterpriseIsolation(req.enterpriseContext, meeting.enterpriseId);

        res.json({
            success: true,
            meeting,
        });
    } catch (error: any) {
        Logger.error(`Failed to get meeting: ${error.message}`);
        const status = error.message.includes('Access denied') ? 403 : 400;
        res.status(status).json({
            success: false,
            message: error.message,
        });
    }
};

export const listMeetings = async (req: Request, res: Response) => {
    try {
        const identity = assertIdentityExists(req);
        const ownership = getOwnershipFromIdentity(identity);

        const whereClause: any = {
            ownerType: ownership.ownerType,
            ownerId: ownership.ownerId,
        };

        if (req.enterpriseContext) {
            whereClause.enterpriseId = req.enterpriseContext.enterpriseId;
        }

        const meetings = await prisma.meeting.findMany({
            where: whereClause,
            orderBy: {
                createdAt: 'desc',
            },
            include: {
                attendances: {
                    select: {
                        id: true,
                        participantName: true,
                        participantEmail: true,
                    },
                },
                tasks: {
                    select: {
                        id: true,
                        title: true,
                        status: true,
                    },
                },
            },
        });

        res.json({
            success: true,
            meetings,
            count: meetings.length,
        });
    } catch (error: any) {
        Logger.error(`Failed to list meetings: ${error.message}`);
        res.status(400).json({
            success: false,
            message: error.message,
        });
    }
};

export const updateMeeting = async (req: Request, res: Response) => {
    try {
        const identity = assertIdentityExists(req);
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

        assertResourceOwnership(identity, meeting.ownerType, meeting.ownerId);

        assertEnterpriseIsolation(req.enterpriseContext, meeting.enterpriseId);

        const { title, description, location, scheduledStart, scheduledEnd } = req.body;

        const updatedMeeting = await prisma.meeting.update({
            where: { id: meetingId },
            data: {
                title: title || meeting.title,
                description: description !== undefined ? description : meeting.description,
                location: location !== undefined ? location : meeting.location,
                scheduledStart: scheduledStart ? new Date(scheduledStart) : meeting.scheduledStart,
                scheduledEnd: scheduledEnd ? new Date(scheduledEnd) : meeting.scheduledEnd,
            },
        });

        Logger.info(`Meeting updated: ${meetingId} by ${identity.type} ${getOwnershipFromIdentity(identity).ownerId}`);

        res.json({
            success: true,
            meeting: updatedMeeting,
        });
    } catch (error: any) {
        Logger.error(`Failed to update meeting: ${error.message}`);
        const status = error.message.includes('Access denied') ? 403 : 400;
        res.status(status).json({
            success: false,
            message: error.message,
        });
    }
};

export const deleteMeeting = async (req: Request, res: Response) => {
    try {
        const identity = assertIdentityExists(req);
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

        assertResourceOwnership(identity, meeting.ownerType, meeting.ownerId);

        assertEnterpriseIsolation(req.enterpriseContext, meeting.enterpriseId);

        await prisma.meeting.delete({
            where: { id: meetingId },
        });

        Logger.info(`Meeting deleted: ${meetingId} by ${identity.type} ${getOwnershipFromIdentity(identity).ownerId}`);

        res.json({
            success: true,
            message: 'Meeting deleted successfully',
        });
    } catch (error: any) {
        Logger.error(`Failed to delete meeting: ${error.message}`);
        const status = error.message.includes('Access denied') ? 403 : 400;
        res.status(status).json({
            success: false,
            message: error.message,
        });
    }
};

export const listEnterpriseMeetings = async (req: Request, res: Response) => {
    try {
        const identity = assertIdentityExists(req);

        if (identity.type !== IdentityType.ENTERPRISE_USER) {
            return res.status(403).json({
                success: false,
                message: 'Enterprise user required',
            });
        }

        if (!req.enterpriseContext) {
            return res.status(403).json({
                success: false,
                message: 'Enterprise context required',
            });
        }

        const meetings = await prisma.meeting.findMany({
            where: {
                enterpriseId: req.enterpriseContext.enterpriseId,
            },
            orderBy: {
                createdAt: 'desc',
            },
            include: {
                attendances: {
                    select: {
                        id: true,
                        participantName: true,
                        participantEmail: true,
                    },
                },
                tasks: {
                    select: {
                        id: true,
                        title: true,
                        status: true,
                        assignee: true,
                    },
                },
            },
        });

        res.json({
            success: true,
            meetings,
            count: meetings.length,
            enterpriseId: req.enterpriseContext.enterpriseId,
        });
    } catch (error: any) {
        Logger.error(`Failed to list enterprise meetings: ${error.message}`);
        res.status(400).json({
            success: false,
            message: error.message,
        });
    }
};
