import XCTest
@testable import MoodSyncCompanion

final class ServerConfigurationTests: XCTestCase {
    func testAcceptsAValidHTTPURLWithPort() {
        guard case .valid(let url) = ServerConfiguration.validate("http://192.168.1.23:3000") else {
            return XCTFail("expected success")
        }
        XCTAssertEqual(url.absoluteString, "http://192.168.1.23:3000")
    }

    func testAcceptsHTTPS() {
        guard case .valid = ServerConfiguration.validate("https://api.example.com") else {
            return XCTFail("expected success")
        }
    }

    func testTrimsWhitespace() {
        guard case .valid(let url) = ServerConfiguration.validate("  http://192.168.1.23:3000  ") else {
            return XCTFail("expected success")
        }
        XCTAssertEqual(url.absoluteString, "http://192.168.1.23:3000")
    }

    func testRejectsEmptyInput() {
        guard case .invalid(let message) = ServerConfiguration.validate("") else {
            return XCTFail("expected failure")
        }
        XCTAssertTrue(message.lowercased().contains("enter"))
    }

    func testRejectsMissingScheme() {
        guard case .invalid = ServerConfiguration.validate("192.168.1.23:3000") else {
            return XCTFail("expected failure")
        }
    }

    func testRejectsNonHTTPScheme() {
        guard case .invalid = ServerConfiguration.validate("ftp://192.168.1.23") else {
            return XCTFail("expected failure")
        }
    }
}
