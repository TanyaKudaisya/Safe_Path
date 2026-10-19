package com.safepath.service;

import java.util.List;
import java.util.Map;

/** Delivers push messages. Returns the tokens the push service says are no longer valid. */
public interface PushGateway {

    List<String> send(List<Map<String, Object>> messages);
}
