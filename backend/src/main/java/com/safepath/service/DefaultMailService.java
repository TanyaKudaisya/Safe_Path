package com.safepath.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Sends email in this order of preference:
 *  1. Brevo HTTPS API, when brevo.api-key is set (works on hosts that block SMTP, e.g. Render free plan)
 *  2. SMTP, when spring.mail.host is set
 *  3. Console print (development only)
 * Sending is asynchronous so response time does not reveal whether an address exists.
 */
@Service
public class DefaultMailService implements MailService {

    private static final Logger log = LoggerFactory.getLogger(DefaultMailService.class);
    private static final String BREVO_URL = "https://api.brevo.com/v3/smtp/email";

    private final ObjectProvider<JavaMailSender> sender;
    private final String from;
    private final String brevoKey;
    private final RestClient http = RestClient.create();
    private final ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "mail-sender");
        t.setDaemon(true);
        return t;
    });

    public DefaultMailService(
            ObjectProvider<JavaMailSender> sender,
            @Value("${mail.from:}") String from,
            @Value("${spring.mail.username:}") String smtpUser,
            @Value("${brevo.api-key:}") String brevoKey
    ) {
        this.sender = sender;
        this.from = (from == null || from.isBlank()) ? smtpUser : from.trim();
        this.brevoKey = brevoKey == null ? "" : brevoKey.trim();
    }

    @Override
    public void send(String to, String subject, String body) {
        if (!brevoKey.isEmpty()) {
            sendWithBrevo(to, subject, body);
            return;
        }
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

    private void sendWithBrevo(String to, String subject, String body) {
        log.info("Sending email via Brevo API to {} (subject: {})", to, subject);
        executor.execute(() -> {
            try {
                Map<String, Object> senderObj = parseSender(from);
                if (senderObj.get("email") == null || senderObj.get("email").toString().isBlank()) {
                    log.error("Brevo needs mail.from (MAIL_FROM) set to your verified sender address");
                    return;
                }
                Map<String, Object> payload = Map.of(
                        "sender", senderObj,
                        "to", List.of(Map.of("email", to)),
                        "subject", subject,
                        "textContent", body);
                http.post()
                        .uri(BREVO_URL)
                        .header("api-key", brevoKey)
                        .header("accept", "application/json")
                        .header("content-type", "application/json")
                        .body(payload)
                        .retrieve()
                        .toBodilessEntity();
                log.info("Email sent to {} via Brevo", to);
            } catch (Exception e) {
                log.error("Could not send email to {} via Brevo: {}", to, e.getMessage());
            }
        });
    }

    /** Accepts "you@example.com" or "Name <you@example.com>". */
    static Map<String, Object> parseSender(String value) {
        if (value == null) {
            return Map.of();
        }
        String v = value.trim();
        int lt = v.indexOf('<');
        int gt = v.indexOf('>');
        if (lt >= 0 && gt > lt) {
            String name = v.substring(0, lt).trim();
            String email = v.substring(lt + 1, gt).trim();
            return name.isEmpty() ? Map.of("email", email) : Map.of("name", name, "email", email);
        }
        return Map.of("name", "SafePath", "email", v);
    }
}
