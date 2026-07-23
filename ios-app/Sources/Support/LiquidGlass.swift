import SwiftUI

/// Liquid Glass, with a floor under it.
///
/// The real APIs arrive in the iOS 26 SDK — which is what CI now builds
/// against — but the deployment target stays at 17.0 so the app still runs on
/// an older phone. Everything below 26 gets a hand-built stand-in: a thin
/// material, a specular hairline and a soft shadow. It does not refract what is
/// behind it, but nothing looks broken, and there is exactly one place to fix
/// when the floor can finally be raised.
extension View {
    @ViewBuilder
    func liquidGlass(
        in shape: some Shape,
        tint: Color? = nil,
        interactive: Bool = false
    ) -> some View {
        if #available(iOS 26.0, *) {
            glassEffect(GlassStyle.make(tint: tint, interactive: interactive), in: shape)
        } else {
            background(.ultraThinMaterial, in: shape)
                .background(shape.fill(tint?.opacity(0.55) ?? .clear))
                .overlay(shape.stroke(.white.opacity(0.22), lineWidth: 0.7))
                .shadow(color: .black.opacity(0.24), radius: 14, y: 6)
        }
    }

    /// Capsule/circle glass is common enough to deserve a name.
    func liquidGlassCapsule(tint: Color? = nil, interactive: Bool = true) -> some View {
        liquidGlass(in: Capsule(), tint: tint, interactive: interactive)
    }
}

@available(iOS 26.0, *)
private enum GlassStyle {
    /// Built stepwise rather than chained inline: `Glass`'s modifiers each
    /// return a new value, and an `if` on a var reads clearer than nesting
    /// ternaries inside a `.glassEffect(...)` call.
    static func make(tint: Color?, interactive: Bool) -> Glass {
        var glass = Glass.regular
        if let tint { glass = glass.tint(tint) }
        if interactive { glass = glass.interactive() }
        return glass
    }
}

/// Wraps sibling glass views so iOS 26 can merge them into one blob when they
/// come close, instead of stacking their blurs. A no-op before 26.
struct GlassGroup<Content: View>: View {
    var spacing: CGFloat = 16
    @ViewBuilder var content: Content

    var body: some View {
        if #available(iOS 26.0, *) {
            GlassEffectContainer(spacing: spacing) { content }
        } else {
            content
        }
    }
}
