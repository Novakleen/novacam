# HubSpot Integration Setup Guide

This document outlines the steps required to configure the HubSpot integration for Novakleen. This integration synchronizes Contacts and Quotes (Deals) from Supabase to HubSpot.

## 1. Supabase Configuration

### Enable Extension
The integration relies on the `hubspot_wrapper` extension to communicate with HubSpot's API directly from the database.

Run the following SQL command in your Supabase SQL Editor: