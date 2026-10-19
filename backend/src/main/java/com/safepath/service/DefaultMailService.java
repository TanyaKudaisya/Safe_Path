package com.safepath.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Sends through SMTP when spring.mail.host is configured; otherwise prints the email to the
 * console so password reset can be tried in development without an email account.
 * Sending is asynchronous so response time does not reveal whether an address exists.
 */
@Service
public class DefaultMailService implements MailService {

    private static final Logger log = LoggerFactory.getLogger(DefaultMailService.class);

    private final ObjectProvider<JavaMailSender> sender;
    private final String from;
    private final ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "mail-sender");
        t.setDaemon(true);
        return t;
    });

    public DefaultMailService(
            ObjectProvider<JavaMailSender> sender,
            @Value("${mail.from:}") String from,
            @Value("${spring.mail.username:}") String smtpUser
    ) {
        this.sender = sender;
        this.from = (from == null || from.isBlank()) ? smtpUser : from;
    }

    @Override
    public void send(String to, String subject, String body) {
        JavaMailSender mailSender = sender.getIfAvailable();
        if (mailSender == null) {
            log.warn("""

                    ===== EMAIL NOT CONFIGURED - printing instead (development only) =====
                    To:      {}
                    Subject: {}
                    {}
                    ======================================================================""",
                    to, subject, body);
            return;
        }
        log.info("Sending email via SMTP to {} (subject: {})", to, subject);
        executor.execute(() -> {
            try {
                SimpleMailMessage msg = new SimpleMailMessage();
                if (from != null && !from.isBlank()) {
                    msg.setFrom(from);
                }
                msg.setTo(to);
                msg.setSubject(subject);
                msg.setText(body);
                mailSender.send(msg);
                log.info("Email sent to {}", to);
            } catch (Exception e) {
                log.error("Could not send email to {}: {}", to, e.getMessage());
            }
        });
    }
}
