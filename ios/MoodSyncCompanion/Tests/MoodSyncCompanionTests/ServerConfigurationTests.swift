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

    // MARK: - Default resolution
    //
    // The app used to require the user to type a server URL before
    // anything worked; these pin the behavior that replaced it.

    override func tearDown() {
        ServerConfiguration.resetToDefault()
        super.tearDown()
    }

    func testBaseURLFallsBackToTheHostedBackendWhenNothingIsStored() {
        ServerConfiguration.resetToDefault()
        XCTAssertNil(ServerConfiguration.storedBaseURL)
        XCTAssertEqual(ServerConfiguration.baseURL, ServerConfiguration.defaultBaseURL)
    }

    func testDefaultBaseURLIsAReachableHTTPSOrigin() {
        XCTAssertEqual(ServerConfiguration.defaultBaseURL.scheme, "https")
        XCTAssertFalse(ServerConfiguration.defaultBaseURL.host?.isEmpty ?? true)
    }

    func testAnExplicitOverrideWinsOverTheDefault() {
        let override = URL(string: "http://192.168.1.23:3000")!
        ServerConfiguration.storedBaseURL = override
        XCTAssertEqual(ServerConfiguration.baseURL, override)
    }

    func testResetToDefaultClearsAnOverride() {
        ServerConfiguration.storedBaseURL = URL(string: "http://192.168.1.23:3000")!
        ServerConfiguration.resetToDefault()
        XCTAssertNil(ServerConfiguration.storedBaseURL)
        XCTAssertEqual(ServerConfiguration.baseURL, ServerConfiguration.defaultBaseURL)
    }
}
