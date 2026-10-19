package com.safepath.service;

/** Sends a plain-text email. Implementations must never throw. */
public interface MailService {

    void send(String to, String subject, String body);
}
