const mongoose = require('mongoose');
const data = require('../config/company');
const Complaint = require('../models/Complaint');
const DataStore = require('../services/dataStore');

exports.getComplaintPage = (req, res) => {
    res.render('public-site/complaints', {
        title: `Service & Complaint Support | ${data.company.name}`,
        metaDescription: `Register or track solar repair, inverter error, or warranty complaints with ${data.company.name}. Quick turnaround in Raisen & MP.`,
        data,
        activePage: 'complaints',
        ticketResult: null
    });
};

exports.submitComplaint = async (req, res) => {
    try {
        const { customerName, mobile, email, systemCapacity, category, description } = req.body;
        
        const cleanMobile = (mobile || '').replace(/\D/g, '').slice(-10);
        if (!cleanMobile || cleanMobile.length !== 10) {
            return res.status(400).json({ success: false, message: "Valid 10-digit Indian mobile number is required." });
        }

        const ticketId = 'SHIVAY-' + Math.floor(10000 + Math.random() * 90000);

        const complaintData = {
            ticketId,
            customerName: (customerName || '').trim(),
            mobile: cleanMobile,
            email: (email || '').trim().toLowerCase(),
            systemCapacity: systemCapacity || '',
            category: category || 'inverter_error',
            description: (description || '').trim(),
            status: 'submitted',
            createdAt: new Date()
        };

        // 1. Always store in DataStore
        if (DataStore.addComplaint) {
            DataStore.addComplaint(complaintData);
        }

        // 2. Persist in MongoDB if connected
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            try {
                await Complaint.create(complaintData);
            } catch (dbErr) {
                console.log(`[COMPLAINT FILED OFFLINE] Ticket: ${ticketId}, Customer: ${customerName}`, dbErr.message);
            }
        }

        return res.json({
            success: true,
            ticketId,
            message: `Aapka complaint ticket successfully generate ho gaya hai: ${ticketId}. Hamare service engineer 24 ghante ke andar aapse sampark karenge.`
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: "Error submitting complaint" });
    }
};

exports.trackComplaint = async (req, res) => {
    try {
        const { ticketId, mobile } = req.query;

        if (!ticketId || typeof ticketId !== 'string' || !mobile || typeof mobile !== 'string') {
            return res.status(400).json({ success: false, message: 'Ticket ID and Mobile number are required.' });
        }

        const cleanTicket = ticketId.trim();
        const cleanMobile = mobile.replace(/\D/g, '').slice(-10);

        if (!cleanTicket || cleanMobile.length !== 10) {
            return res.status(400).json({ success: false, message: 'Please provide a valid Ticket ID and 10-digit mobile number.' });
        }

        let complaint = null;
        if (mongoose.connection.readyState === 1 || (Complaint && Complaint.findOne && Complaint.findOne.name !== 'findOne')) {
            try {
                const query = Complaint.findOne({
                    ticketId: { $regex: new RegExp('^' + cleanTicket.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') },
                    mobile: { $regex: new RegExp(cleanMobile + '$') }
                });
                complaint = (query && typeof query.lean === 'function') ? await query.lean() : await query;
            } catch (e) {
                console.error('Complaint DB lookup error:', e);
            }
        }

        // Fallback to DataStore if not in MongoDB
        if (!complaint && DataStore.getComplaint) {
            complaint = DataStore.getComplaint(cleanTicket, cleanMobile);
        }

        if (!complaint) {
            return res.status(404).json({
                success: false,
                message: 'Complaint ticket not found. Please verify your ticket number.'
            });
        }

        // Return only safe public status tracking fields (no PII exposure)
        return res.json({
            success: true,
            complaint: {
                ticketId: complaint.ticketId,
                status: complaint.status || 'submitted',
                category: complaint.category || 'general_service',
                createdAt: complaint.createdAt,
                resolutionNotes: complaint.resolutionNotes || 'Technician assigned. Under review.'
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error tracking complaint.' });
    }
};
