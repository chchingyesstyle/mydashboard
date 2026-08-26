#pragma once

#include <cstdint>
#include <string>

enum class FetchStatus { NotModified, Updated, Failed };

struct FetchResult {
  FetchStatus status;
  std::string body;
  std::string etag;
};

bool connectWiFi(uint32_t timeoutMs);
FetchResult fetchDashboard(const std::string& lastEtag, const std::string& routeId);
